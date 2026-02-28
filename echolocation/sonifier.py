"""
sonifier.py - 깊이 맵 → 공간 음향 변환 엔진

3축 매핑 원칙:
  X축 (패닝)  : 화면 왼쪽 → 왼쪽 스피커, 오른쪽 → 오른쪽 스피커
  Y축 (피치)  : 화면 위쪽(높은 위치) = 높은 음, 아래쪽 = 낮은 음
  Z축 (볼륨)  : 가까운 물체 = 크게, 먼 물체 = 작게

히트맵 기반 처리:
  - 전체 깊이 맵을 한 프레임에 동시에 처리 (스윕 없음)
  - 각 셀(열×행)이 X패닝+Y피치+Z볼륨으로 직접 기여
  - 왼쪽/오른쪽 장애물이 각각 L/R 채널에 독립적으로 반영
"""

import numpy as np
import threading


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
    깊이 맵 전체를 받아 히트맵 기반 3D 스테레오 오디오를 생성한다.

    사용법:
        sonifier = Sonifier()
        sonifier.start()
        ...
        sonifier.update_frame(depth_map)  # 프레임 루프에서 호출
        ...
        sonifier.stop()
    """

    def __init__(self):
        self._lock = threading.Lock()

        # 밴드별 L/R 독립 진폭 (히트맵 기반)
        self._target_L = np.zeros(NUM_BANDS, dtype=np.float64)
        self._target_R = np.zeros(NUM_BANDS, dtype=np.float64)
        self._smooth_L = np.zeros(NUM_BANDS, dtype=np.float64)
        self._smooth_R = np.zeros(NUM_BANDS, dtype=np.float64)

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

    def update_frame(self, depth_map: np.ndarray):
        """
        전체 깊이 맵을 한 번에 받아 히트맵 기반으로 L/R 진폭 갱신.

        Args:
            depth_map: 2D 배열, shape=(height, width), 값 0(가까움)~1(멀음)
                       행 0 = 화면 상단 → 높은 피치
                       열 0 = 화면 좌측 → 왼쪽 패닝
        """
        h, w = depth_map.shape
        target_L = np.zeros(NUM_BANDS, dtype=np.float64)
        target_R = np.zeros(NUM_BANDS, dtype=np.float64)

        band_edges = np.linspace(0, h, NUM_BANDS + 1, dtype=int)

        # 열 위치 → 패닝 (-1:좌 ~ +1:우)
        col_pans = np.linspace(-1.0, 1.0, w)
        pan_rad  = (col_pans + 1.0) * 0.5 * np.pi / 2.0
        gains_L  = np.cos(pan_rad)   # (width,)
        gains_R  = np.sin(pan_rad)   # (width,)

        for b in range(NUM_BANDS):
            row_start = band_edges[b]
            row_end   = band_edges[b + 1]
            if row_end <= row_start:
                continue

            # 이 밴드의 행 슬라이스: shape=(band_h, width)
            band_slice = depth_map[row_start:row_end, :]

            # 각 열에서 가장 가까운 픽셀 깊이
            col_depths = np.min(band_slice, axis=0)   # (width,)

            # 거리 → 볼륨 (가까울수록 크게)
            clamped = np.clip(col_depths, NEAR_DIST, FAR_DIST)
            vols    = np.where(
                col_depths >= FAR_DIST,
                0.0,
                ((FAR_DIST - clamped) / (FAR_DIST - NEAR_DIST)) ** 1.5
            )

            # 위에서 b번째 밴드 = 고음 (주파수 인덱스 뒤집기)
            freq_idx = NUM_BANDS - 1 - b

            # 각 열의 기여를 L/R 채널에 합산
            target_L[freq_idx] = float(np.sum(vols * gains_L)) / w
            target_R[freq_idx] = float(np.sum(vols * gains_R)) / w

        with self._lock:
            self._target_L = target_L
            self._target_R = target_R

    # ── 내부 오디오 콜백 ─────────────────────────

    def _audio_callback(self, outdata, frames, time_info, status):
        """sounddevice가 오디오 블록마다 호출하는 콜백 (별도 스레드)"""
        left  = np.zeros(frames, dtype=np.float64)
        right = np.zeros(frames, dtype=np.float64)

        with self._lock:
            target_L = self._target_L.copy()
            target_R = self._target_R.copy()

        t = np.arange(frames, dtype=np.float64) / SAMPLE_RATE

        for i in range(NUM_BANDS):
            # 지수 평활로 클릭 잡음(pop) 방지
            self._smooth_L[i] += SMOOTH_ALPHA * (target_L[i] - self._smooth_L[i])
            self._smooth_R[i] += SMOOTH_ALPHA * (target_R[i] - self._smooth_R[i])
            vol_L = self._smooth_L[i]
            vol_R = self._smooth_R[i]

            if vol_L < 1e-4 and vol_R < 1e-4:
                self._phases[i] += 2 * np.pi * BAND_FREQS[i] * frames / SAMPLE_RATE
                self._phases[i] %= 2 * np.pi
                continue

            # 사인파 생성 (위상 연속)
            phase0 = self._phases[i]
            wave = np.sin(2 * np.pi * BAND_FREQS[i] * t + phase0)
            self._phases[i] = (phase0 + 2 * np.pi * BAND_FREQS[i] * frames / SAMPLE_RATE) \
                               % (2 * np.pi)

            amp   = MAX_AMPLITUDE / NUM_BANDS
            left  += wave * vol_L * amp
            right += wave * vol_R * amp

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
