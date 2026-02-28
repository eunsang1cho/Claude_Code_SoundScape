# SoundScape

시각장애인을 위한 공간 청각화 보조 시스템.
깊이 정보를 3차원 오디오 신호로 변환하여 청각만으로 주변 공간을 인지할 수 있도록 합니다.

## 개념

히트맵 기반 3D 스테레오 사운드 — 전체 화면을 한 프레임에 동시 처리:

- **X축 (좌우)** → 스테레오 패닝 (왼쪽 장애물 → 좌 채널, 오른쪽 → 우 채널)
- **Y축 (높이)** → 피치 (높은 위치 = 고음, 낮은 위치 = 저음)
- **Z축 (거리)** → 볼륨 (가까울수록 크게)

## 기술 스택

- **입력**: Depth Camera (Intel RealSense) / Webcam + MiDaS AI 깊이 추정
- **출력**: 골전도 헤드폰 (귀 개방형) + 히트맵 기반 3D 스테레오 음향
- **언어**: Python (`sounddevice`, `numpy`, `opencv-python`) / GDScript (Godot 4)

## 구조

```
echolocation/
  depth_source.py        # 깊이 데이터 소스 (시뮬레이션 / 웹캠 / MiDaS)
  sonifier.py            # 깊이맵 → 히트맵 기반 3D 스테레오 오디오 엔진
  main.py                # 메인 실행 루프

echolocation_sim/        # Godot 4 인터랙티브 시뮬레이터
  scripts/
    echolocation.gd      # 7×5 RayCast 깊이 그리드 (5 FPS)
    audio_feedback.gd    # 히트맵 기반 스테레오 사운드 생성
    heatmap_overlay.gd   # RGB 컬러맵 HUD (H키 토글)
    player.gd            # 1인칭 WASD 이동

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
W/A/S/D: 이동 | 마우스: 시점 | H: 히트맵 HUD 토글
```

## 참고 자료

- [The vOICe](https://www.seeingwithsound.com/) - 시각-청각 변환 선행 연구
- Sensory Substitution 분야 연구
- Intel MiDaS - 단안 깊이 추정 모델
