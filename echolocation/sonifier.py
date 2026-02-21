"""
sonifier.py - 깊이 맵 → 공간 음향 변환 엔진

3축 매핑 원칙:
  X축 (시간)   : 레이더처럼 왼쪽→오른쪽으로 훑는 스캔 속도
  Y축 (피치)   : 화면 위쪽(높은 위치) = 높은 음, 아래쪽 = 낮은 음
  Z축 (볼륨)   : 가까운 물체 = 크게, 먼 물체 = 작게
  보너스 (패닝): 스캔 위치의 좌/우를 스테레오로 표현

음향 생성:
  - 사인파 합성 (additive synthesis)
  - 높이축을 N개 밴드로 분할, 각 밴드마다 고유 주파수
  - 해당 밴드에서 가장 가까운 픽셀의 거리로 볼륨 계산
  - 부드러운 볼륨 변화를 위한 지수 평활(exponential smoothing)
"""

import numpy as np
import threading
import time
from typing import List, Tuple


# ──────────────────────────────────────────────
# 설정 상수
# ──────────────────────────────────────────────

SAMPLE_RATE   = 44100       # Hz
BLOCK_SIZE    = 512         # 오디오 콜백당 샘플 수 (≈11.6ms @ 44100)
NUM_BANDS     = 12          # 높이 분할 밴드 수
MIN_FREQ      = 150.0       # Hz - 화면 최하단 (바닥)
MAX_FREQ      = 2400.0      # Hz - 화면 최상단 (천장)
MAX_AMPLITUDE = 0.18        # 채널 당 최대 진폭 (클리핑 방지)
SMOOTH_ALPHA  = 0.25        # 볼륨 평활 계수 (0=느림, 1=즉각)
NEAR_DIST     = 0.05        # 이 거리 이하 = 최대 볼륨 (0~1 정규화)
FAR_DIST      = 0.85        # 이 거리 이상 = 무음


# ──────────────────────────────────────────────
# 주파수 밴드 계산 (로그 스케일 = 음악적 균등감)
# ──────────────────────────────────────────────

def _log_freqs(n: int, f_low: float, f_high: float) -> np.ndarray:
    """n개 밴드의 중심 주파수를 로그 간격으로 반환"""
    return np.exp(np.linspace(np.log(f_low), np.log(f_high), n))


BAND_FREQS = _log_freqs(NUM_BANDS, MIN_FREQ, MAX_FREQ)  # [저 → 고]


# ──────────────────────────────────────────────
# 핵심 클래스
# ──────────────────────────────────────────────

class Sonifier:
    """
    깊이 맵 한 열(column)을 받아 실시간 오디오를 생성한다.

    사용법:
        sonifier = Sonifier()
        sonifier.start()
        ...
        sonifier.update_column(depth_col, pan=-0.5)  # 스캔 루프에서 호출
        ...
        sonifier.stop()
    """

    def __init__(self):
        self._lock = threading.Lock()

        # 현재 재생 중인 밴드별 상태
        self._target_vol  = np.zeros(NUM_BANDS, dtype=np.float64)
        self._smooth_vol  = np.zeros(NUM_BANDS, dtype=np.float64)
        self._pan         = 0.0   # -1(완전 왼쪽) ~ +1(완전 오른쪽)

        # 위상 추적 (연속 사인파 생성용)
        self._phases = np.zeros(NUM_BANDS, dtype=np.float64)

        self._stream = None
        self._running = False

    # ── 공개 인터페이스 ──────────────────────────

    def start(self):
        """오디오 스트림 시작"""
        try:
            import sounddevice as sd
        except ImportError:
            raise ImportError("sounddevice 설치 필요: pip install sounddevice")

        self._running = True
        self._stream = sd.OutputStream(
            samplerate=SAMPLE_RATE,
            channels=2,
            dtype='float32',
            blocksize=BLOCK_SIZE,
            callback=self._audio_callback,
        )
        self._stream.start()

    def stop(self):
        """오디오 스트림 종료"""
        self._running = False
        if self._stream:
            self._stream.stop()
            self._stream.close()
            self._stream = None

    def update_column(self, depth_col: np.ndarray, pan: float):
        """
        스캐너가 새 열을 읽을 때마다 호출.

        Args:
            depth_col: 1D 배열, shape=(height,), 값 0(가까움)~1(멀음)
                       인덱스 0 = 화면 상단 → 높은 피치
            pan:       -1.0(좌) ~ +1.0(우), 현재 스캔 위치
        """
        h = len(depth_col)
        target = np.zeros(NUM_BANDS, dtype=np.float64)

        band_edges = np.linspace(0, h, NUM_BANDS + 1, dtype=int)

        for i in range(NUM_BANDS):
            # 밴드 i는 화면 위에서 i번째 → 높은 인덱스 i = 화면 하단
            # BAND_FREQS[0] = 저음 → 아래쪽에 배치
            # 따라서 배열을 뒤집어서 매핑: band i (위) ↔ BAND_FREQS[NUM_BANDS-1-i] (고음)
            row_start = band_edges[i]
            row_end   = band_edges[i + 1]
            if row_end <= row_start:
                continue

            band_depths = depth_col[row_start:row_end]
            min_depth   = float(np.min(band_depths))

            if min_depth >= FAR_DIST:
                vol = 0.0
            else:
                # 거리 → 볼륨: 가까울수록 크게 (역수 매핑)
                clamped = max(min_depth, NEAR_DIST)
                vol = (FAR_DIST - clamped) / (FAR_DIST - NEAR_DIST)
                vol = vol ** 1.5   # 지수 강조 (중간 거리 대비 향상)

            # 위에서 i번째 밴드 = 고음(NUM_BANDS-1-i 인덱스 주파수)
            freq_idx = NUM_BANDS - 1 - i
            target[freq_idx] = vol

        with self._lock:
            self._target_vol = target
            self._pan = float(np.clip(pan, -1.0, 1.0))

    # ── 내부 오디오 콜백 ─────────────────────────

    def _audio_callback(self, outdata, frames, time_info, status):
        """sounddevice가 오디오 블록마다 호출하는 콜백 (별도 스레드)"""
        left  = np.zeros(frames, dtype=np.float64)
        right = np.zeros(frames, dtype=np.float64)

        with self._lock:
            target = self._target_vol.copy()
            pan    = self._pan

        # 스테레오 패닝 계수 (constant-power panning)
        pan_rad  = (pan + 1) * 0.5 * np.pi / 2   # 0 ~ π/2
        gain_l   = np.cos(pan_rad)
        gain_r   = np.sin(pan_rad)

        t = np.arange(frames, dtype=np.float64) / SAMPLE_RATE

        for i in range(NUM_BANDS):
            # 지수 평활로 클릭 잡음(pop) 방지
            self._smooth_vol[i] += SMOOTH_ALPHA * (target[i] - self._smooth_vol[i])
            vol = self._smooth_vol[i]

            if vol < 1e-4:
                # 위상은 계속 진행시켜야 나중에 다시 켜질 때 클릭 없음
                self._phases[i] += 2 * np.pi * BAND_FREQS[i] * frames / SAMPLE_RATE
                self._phases[i] %= 2 * np.pi
                continue

            # 사인파 생성 (위상 연속)
            phase0 = self._phases[i]
            wave = np.sin(2 * np.pi * BAND_FREQS[i] * t + phase0)

            # 위상 업데이트
            self._phases[i] = (phase0 + 2 * np.pi * BAND_FREQS[i] * frames / SAMPLE_RATE) \
                               % (2 * np.pi)

            amplitude = vol * MAX_AMPLITUDE / NUM_BANDS
            left  += wave * amplitude * gain_l
            right += wave * amplitude * gain_r

        # 소프트 클리핑 (tanh)
        outdata[:, 0] = np.tanh(left).astype(np.float32)
        outdata[:, 1] = np.tanh(right).astype(np.float32)


# ──────────────────────────────────────────────
# 주파수 정보 출력 (디버그용)
# ──────────────────────────────────────────────

def print_band_info():
    print(f"\n[밴드 주파수 매핑] (총 {NUM_BANDS}개 밴드)")
    print(f"{'밴드':>4} {'화면위치':>8} {'주파수':>10}")
    print("-" * 28)
    for i in range(NUM_BANDS):
        pos = "상단(고)" if i < 2 else ("하단(저)" if i >= NUM_BANDS - 2 else "중간")
        freq_idx = NUM_BANDS - 1 - i
        print(f"  {i+1:>2}  {pos:>8}  {BAND_FREQS[freq_idx]:>8.1f} Hz")
    print()
