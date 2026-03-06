# SoundScape

시각장애인을 위한 공간 청각화 보조 시스템.
깊이 정보를 3차원 오디오 신호로 변환하여 청각만으로 주변 공간을 인지할 수 있도록 합니다.

## 개념

히트맵 기반 3D 바이노럴 사운드 — 전체 화면을 한 프레임에 동시 처리:

- **X축 (좌우)** → ITD(귀간 시간차) + 스테레오 패닝
- **Y축 (높이)** → 로그 피치 (높은 위치 = 고음, 낮은 위치 = 저음)
- **Z축 (거리)** → 진폭 감쇠 + 고주파 대기 흡수 (먼 물체 = 어두운 음색)

## 기술 스택

- **입력**: Depth Camera (Intel RealSense) / Webcam + MiDaS AI 깊이 추정
- **출력**: 골전도 헤드폰 (귀 개방형) + 히트맵 기반 3D 스테레오 음향
- **언어**: Python (`sounddevice`, `numpy`, `opencv-python`) / GDScript (Godot 4)

## 오디오 모드

| 키 | 모드 | 설명 |
|----|------|------|
| **1** | 동시재생 | 전 열 합산 + ITD(Woodworth) + 대기흡수 + sqrt 압축 |
| **2** | vOICe 순차스캔 | L→R 열 순차 재생, 스캔 위치=스테레오 단서 (Meijer 1992) |
| **3** | 거리→버즈 | AM 속도가 거리 인코딩: 가까움=15Hz 진동, 멀음=0.5Hz 맥박 |

- 가장 가까운 장애물 거리에 따라 스캔 속도/펄스 속도 동적 조정
- 구멍(바닥 함몰) → 음수 신호로 구분, 돌출 장애물과 다른 음색

## 구조

```
echolocation/
  depth_source.py        # 깊이 데이터 소스 (시뮬레이션 / 웹캠 / MiDaS)
  sonifier.py            # 깊이맵 → 히트맵 기반 3D 바이노럴 오디오 엔진
  main.py                # 메인 실행 루프

echolocation_sim/        # Godot 4 인터랙티브 시뮬레이터
  scripts/
    echolocation.gd      # 21×15 RayCast 깊이 그리드 (5 FPS, 오디오는 7×5 다운샘플)
    audio_feedback.gd    # 3가지 에코로케이션 오디오 모드
    heatmap_overlay.gd   # RGB 컬러맵 HUD (H키 토글)
    settings_overlay.gd  # 실시간 파라미터 조정 패널 (Tab키)
    player.gd            # 1인칭 WASD 이동

minecraft-plugin/        # Paper 1.20.4 마인크래프트 플러그인 (별도 브랜치)

requirements.txt
```

## 실행

**Python (실제 카메라 / 시뮬레이션)**
```bash
pip install -r requirements.txt
python echolocation/main.py
```

**Godot 시뮬레이터**
```
Godot 4 에서 echolocation_sim/project.godot 열기 → F5 실행

이동     : W/A/S/D + 마우스 시점
오디오   : 1=동시재생  2=vOICe순차  3=거리버즈
HUD      : H=히트맵  Tab=파라미터 패널
기타     : R=리스폰  F4=전체화면  ESC=마우스 해제
```

## 적용 연구 (Research Foundation)

### 청각 공간화 (Spatial Audio)

| 연구 | 적용 내용 |
|------|-----------|
| **Woodworth, R.S. (1954)**. *Experimental Psychology*. Holt. | ITD 구형 두부 모델: `ITD = (r/c)(θ + sinθ)`, max ≈ 655µs @ 90° |
| **Rayleigh, Lord (1907)**. "On our perception of sound direction." *Phil. Magazine*. | Duplex Theory: 200-700 Hz 대역은 ITD가 주요 측위 단서 |
| **Duda, R.O. & Martens, W.L. (1998)**. "Range dependence of the response of a spherical head model." *JASA 104(5)*. | ILD 셸프 필터, 근거리 효과 (<1m) |
| **Blauert, J. (1997)**. *Spatial Hearing*. MIT Press. | 1/r 직접음 거리 감쇠 (압력 기준) |
| **Zahorik, P. (2002)**. "Assessing auditory distance perception using virtual acoustics." *JASA 111(4)*. | 지각적 거리 추정: JND ≈ 10-15% at 1-3m |
| **ISO 9613-1 (1993)**. *Attenuation of sound during propagation outdoors.* | 대기 흡수 계수: 고주파일수록 거리에 따른 감쇠 ↑ |

### 감각 대체 기기 (Sensory Substitution Devices)

| 연구 | 적용 내용 |
|------|-----------|
| **Meijer, P.B.L. (1992)**. "An Experimental System for Auditory Image Representations." *IEEE Trans. Biomed. Eng. 39(2)*. | The vOICe: 로그 주파수 스케일, 좌→우 시간 순차 스캔 방식 |
| **Capelle, C. et al. (1998)**. "A real-time experimental prototype for enhancement of vision rehabilitation using auditory substitution." *IEEE Trans. Biomed. Eng. 45(10)*. | PSVA: √ 진폭 압축 (지각적 등음량 보정), 주파수 범위 250-4000 Hz |
| **Abboud, S. et al. (2014)**. "EyeMusic: Introducing a 'visual' colorful experience for the blind using sound." *Restorative Neurology and Neuroscience*. | 주파수 범위 200-8000 Hz, 4 Hz 스캔 속도 |

### 인간 에코로케이션 (Human Echolocation)

| 연구 | 적용 내용 |
|------|-----------|
| **Thaler, L. et al. (2011)**. "Neural correlates of natural human echolocation in early and late blind echolocation experts." *Current Biology 21(25)*. | 최적 핑 반복률 2-4 Hz, 2-4 kHz 대역 최고 효율 |
| **Kolarik, A.J. et al. (2016)**. "Auditory distance perception in humans." *Attention, Perception & Psychophysics*. | RT60 0.3-0.6s가 내비게이션에 최적, DRR이 거리 단서 |
| **Luce, R.D. & Clark, W. (1965)**. 심리음향 어택/릴리즈 모델. | 빠른 어택(×2.2) / 느린 릴리즈: 접근 장애물 즉각 경고 |

### 파라미터 근거

| 파라미터 | 값 | 출처 |
|----------|-----|------|
| 두부 반지름 | 0.0875 m | 성인 평균 (Woodworth) |
| 음속 | 343 m/s | 표준 (20°C) |
| 최대 ITD | ~655 µs ≈ 29 샘플 @44100Hz | Woodworth 모델 |
| 핑 반복률 | 2.5 Hz | Thaler (2011) |
| 주파수 범위 | 200-700 Hz | PSVA + 청취 피로 최소화 |
| sqrt 진폭 압축 | √(1-t) | PSVA (Capelle 1998) |
| ITD 링버퍼 | 34 샘플 | max(29) + 여유 |
| 수직 레이 범위 | +8° ~ -30° | Thaler (2011) 구멍 탐지 강화 |

## 참고 자료

- [The vOICe](https://www.seeingwithsound.com/) — Meijer (1992) 시각-청각 변환 원조
- [EyeMusic](https://www.eyemusicapp.com/) — 색상-악기 감각 대체
- Intel MiDaS — 단안 깊이 추정 모델
