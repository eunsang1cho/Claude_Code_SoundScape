# SoundScape

시각장애인을 위한 공간 청각화 보조 시스템.
깊이 정보를 3차원 오디오 신호로 변환하여 청각만으로 주변 공간을 인지할 수 있도록 합니다.

## 개념

- **X축 (좌우)** → 시간 sweep (왼쪽→오른쪽 스캔)
- **Y축 (높이)** → 피치 (높은 위치 = 고음)
- **Z축 (거리)** → 볼륨 + 리버브 (가까울수록 크고 선명하게)

## 기술 스택

- **입력**: Depth Camera (Intel RealSense) / Webcam + MiDaS AI 깊이 추정
- **출력**: 골전도 헤드폰 (귀 개방형) + HRTF 기반 3D 공간 음향
- **언어**: Python (`sounddevice`, `numpy`, `opencv-python`)

## 구조

```
echolocation/
  depth_source.py   # 깊이 데이터 소스 (시뮬레이션 / 웹캠 / RealSense)
  sonifier.py       # 깊이맵 → 오디오 변환 엔진
  main.py           # 메인 실행 루프
requirements.txt
```

## 실행

```bash
pip install -r requirements.txt
python echolocation/main.py
```

## 참고 자료

- [The vOICe](https://www.seeingwithsound.com/) - 시각-청각 변환 선행 연구
- HRTF (Head-Related Transfer Function) 기반 공간 음향
- Sensory Substitution 분야 연구
