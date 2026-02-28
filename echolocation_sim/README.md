# EcholocationSim — Ubuntu 설치 및 실행 가이드

> Godot 4 기반 에코로케이션 공간 인지 시뮬레이터
> RayCast 깊이 격자 + 실시간 사인파 오디오 + 히트맵 HUD

---

## 목차

1. [시스템 요구사항](#시스템-요구사항)
2. [Godot 4 설치](#godot-4-설치)
   - [방법 A — Flatpak (권장)](#방법-a--flatpak-권장)
   - [방법 B — 공식 바이너리 직접 다운로드](#방법-b--공식-바이너리-직접-다운로드)
   - [방법 C — snap](#방법-c--snap)
3. [프로젝트 열기](#프로젝트-열기)
4. [실행](#실행)
5. [조작키](#조작키)
6. [로직 검증 (Godot 없이)](#로직-검증-godot-없이)
7. [트러블슈팅](#트러블슈팅)

---

## 시스템 요구사항

| 항목 | 최소 | 권장 |
|---|---|---|
| OS | Ubuntu 20.04 LTS | Ubuntu 22.04 / 24.04 LTS |
| CPU | x86-64, 2코어 | 4코어 이상 |
| RAM | 4 GB | 8 GB |
| GPU | OpenGL 3.3 지원 | Vulkan 1.0 지원 (Forward Plus) |
| 오디오 | ALSA / PulseAudio / PipeWire | PipeWire |
| Python | 3.8 이상 (검증 스크립트용) | 3.10 이상 |

> **GPU 없는 환경(WSL2, 헤드리스 VM)**:
> Godot 4는 GPU가 필수입니다. VirtualBox라면 3D 가속을 활성화하세요.

---

## Godot 4 설치

### 방법 A — Flatpak (권장)

가장 안정적이며 최신 버전을 유지하기 쉽습니다.

```bash
# 1. Flatpak 설치 (이미 있으면 생략)
sudo apt update && sudo apt install -y flatpak

# 2. Flathub 저장소 추가 (이미 있으면 생략)
flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo

# 3. Godot 4 설치
flatpak install -y flathub org.godotengine.Godot

# 4. 설치 확인
flatpak run org.godotengine.Godot --version
```

이후 실행:
```bash
flatpak run org.godotengine.Godot
```

---

### 방법 B — 공식 바이너리 직접 다운로드

```bash
# 1. 최신 Godot 4.3 stable 다운로드 (64비트 Linux)
wget -O /tmp/godot.zip \
  "https://github.com/godotengine/godot/releases/download/4.3-stable/Godot_v4.3-stable_linux.x86_64.zip"

# 2. 압축 해제 및 설치
unzip /tmp/godot.zip -d /tmp/godot_extracted
sudo mv /tmp/godot_extracted/Godot_v4.3-stable_linux.x86_64 /usr/local/bin/godot4
sudo chmod +x /usr/local/bin/godot4

# 3. 설치 확인
godot4 --version
```

이후 실행:
```bash
godot4
```

---

### 방법 C — snap

```bash
sudo snap install godot-4 --classic

# 설치 확인
godot-4 --version
```

이후 실행:
```bash
godot-4
```

---

## 프로젝트 열기

### 1. 저장소 클론

```bash
git clone <repo-url>
cd Claude_Code_Cloude_forAnything
```

### 2. Godot Project Manager에서 프로젝트 임포트

Godot를 실행하면 **Project Manager** 화면이 뜹니다.

```
[Import] 버튼 클릭
  → "Browse" 클릭
  → echolocation_sim/project.godot 선택
  → [Import & Edit] 클릭
```

또는 터미널에서 직접 열기:

```bash
# Flatpak
flatpak run org.godotengine.Godot --editor \
  "$(pwd)/echolocation_sim/project.godot"

# 바이너리 직접 설치
godot4 --editor "$(pwd)/echolocation_sim/project.godot"
```

### 3. 에디터 초기화 대기

처음 열면 셰이더 컴파일 및 임포트가 자동으로 진행됩니다 (1~2분 소요).
하단 상태바에 진행률이 표시됩니다.

---

## 실행

### 에디터에서 실행 (F5)

```
에디터 상단 ▶ (Play) 버튼 클릭  또는  F5
```

메인 씬 선택 팝업이 뜨면 **`main.tscn`** 선택 후 확인.

### 터미널에서 헤드리스 없이 직접 실행

```bash
# Flatpak
flatpak run org.godotengine.Godot \
  --path "$(pwd)/echolocation_sim" \
  --main-pack res://main.tscn

# 바이너리 직접 설치
godot4 --path "$(pwd)/echolocation_sim"
```

---

## 조작키

| 키 | 동작 |
|---|---|
| `W` / `A` / `S` / `D` | 전진 / 좌 / 후진 / 우 이동 |
| `마우스 이동` | 시점 회전 (1인칭) |
| `H` | 히트맵 HUD 켜기/끄기 |
| `ESC` | 마우스 커서 해제 |
| `ESC` (커서 해제 상태) | 게임 종료 |

### 히트맵 색상 의미

```
■ 빨강  → 장애물 매우 가까움 (0 ~ 1.6 m)
■ 노랑  → 중간 거리          (1.6 ~ 3.3 m)
■ 초록  → 비교적 안전         (3.3 ~ 5.0 m)
■ 파랑  → 감지 범위 밖        (5.0 m 이상)
```

### 오디오 피드백 구조

```
왼쪽 스피커 강조  ← 좌측 장애물 접근 시 250~800 Hz 상승
중앙 동일 음량    ← 정면 장애물 접근 시 500~1200 Hz 상승
오른쪽 스피커 강조 ← 우측 장애물 접근 시 350~900 Hz 상승

공통: 가까울수록 음높이 ↑, 멀수록 음량·음높이 ↓
```

---

## 로직 검증 (Godot 없이)

Godot 설치 전에 핵심 수학/로직을 Python으로 검증할 수 있습니다.

```bash
# Python 3.8 이상 필요 (표준 라이브러리만 사용, 추가 설치 없음)
cd echolocation_sim
python3 validate.py
```

**검증 항목 (총 33개):**

| 섹션 | 내용 |
|---|---|
| 파일 존재 | 7개 소스 파일 비어있지 않음 |
| 시그널 일관성 | `depth_updated` emit → `on_depth_updated` 수신 연결 |
| 방향 벡터 | 단위벡터 정규화, 중앙 레이 -Z 방향, 수평 FOV 60° |
| 존 분류 | 7열 → 좌[0,1] / 중앙[2,3,4] / 우[5,6] |
| 주파수·진폭 | 거리↑ 시 주파수·진폭 단조 감소 |
| 컬러맵 | RGB 전 구간 0~1 범위, 경계값 정확성 |
| 스테레오 패닝 | 좌/우 존 비대칭, 중앙 존 대칭 |
| 상수 | 5 FPS, MAX_DIST=5m, 7×5 격자 |

---

## 트러블슈팅

### Godot 실행 시 검은 화면 / Vulkan 오류

```bash
# Vulkan 드라이버 확인
vulkaninfo --summary 2>/dev/null | head -20

# Vulkan 불가 환경에서는 OpenGL 호환 모드로 실행
godot4 --rendering-method gl_compatibility --path "$(pwd)/echolocation_sim"
```

### 오디오가 들리지 않음

```bash
# PulseAudio 실행 확인
pulseaudio --check && echo "실행 중" || pulseaudio --start

# PipeWire 환경 확인
pactl info | grep "Server Name"

# 오디오 장치 목록
pactl list sinks short
```

### 마우스 커서가 잡히지 않음 (캡처 실패)

Wayland 세션에서 발생할 수 있습니다.

```bash
# X11 세션으로 전환하거나, 환경 변수 설정 후 실행
GDK_BACKEND=x11 godot4 --path "$(pwd)/echolocation_sim"
```

### `flatpak run` 후 프로젝트 경로 접근 거부

```bash
# 홈 디렉토리 접근 권한 부여
flatpak override --user --filesystem=home org.godotengine.Godot
```

### Python 검증 스크립트 실패

```bash
python3 --version   # 3.8 이상인지 확인
python3 validate.py 2>&1 | grep FAIL
```

---

## 파일 구조

```
echolocation_sim/
├── project.godot          ← Godot 프로젝트 설정 (입력맵 포함)
├── main.tscn              ← 메인 씬 진입점
├── validate.py            ← 플랫폼 독립 로직 검증 (Python)
└── scripts/
    ├── main.gd            ← 월드·플레이어·HUD 씬 코드 생성
    ├── player.gd          ← 1인칭 WASD + 마우스 이동
    ├── echolocation.gd    ← 7×5 RayCast 격자, 5 FPS 깊이 스캔
    ├── audio_feedback.gd  ← 3존 스테레오 사인파 생성
    └── heatmap_overlay.gd ← 컬러 히트맵 HUD (H키 토글)
```
