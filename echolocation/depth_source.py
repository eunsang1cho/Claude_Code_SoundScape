"""
depth_source.py - 공간 깊이(거리) 데이터 소스

지원 모드:
  1. SimulationSource  - 가상 장면 자동 생성 (카메라 불필요)
  2. WebcamSource      - 웹캠 영상을 흑백 밝기로 깊이 근사
  3. MiDaSSource       - 웹캠 + MiDaS AI 모델 (고정밀, torch 필요)

깊이 맵 규약:
  - numpy 2D 배열, shape: (height, width)
  - 값 범위: 0.0(매우 가까움) ~ 1.0(매우 멀거나 없음)
  - 위쪽 행(row 0) = 화면 상단 (높은 위치)
  - 왼쪽 열(col 0) = 화면 좌측
"""

import numpy as np
import time


# ──────────────────────────────────────────────
# 1. 시뮬레이션 소스
# ──────────────────────────────────────────────

class SimulationSource:
    """
    가상 3D 장면을 시간에 따라 변화시키며 깊이 맵을 생성한다.
    카메라 없이 바로 테스트 가능.

    장면 구성:
      - 배경 벽 (멀리)
      - 바닥면 (아래로 갈수록 가까움)
      - 여러 개의 이동하는 물체
    """

    def __init__(self, width: int = 64, height: int = 32):
        self.width = width
        self.height = height
        self._t = 0.0

        # 물체들: (cx, cy, radius, speed_x, speed_y, depth)
        rng = np.random.default_rng(42)
        self._objects = [
            {
                'cx': rng.uniform(0.1, 0.9),
                'cy': rng.uniform(0.1, 0.9),
                'r':  rng.uniform(0.05, 0.15),
                'vx': rng.uniform(-0.05, 0.05),
                'vy': rng.uniform(-0.03, 0.03),
                'depth': rng.uniform(0.1, 0.6),
            }
            for _ in range(5)
        ]

    def get_depth(self) -> np.ndarray:
        """현재 프레임의 깊이 맵 반환 (0=가까움, 1=멀음)"""
        self._t += 0.016  # ~60fps tick

        # 기본 배경: 멀리 있는 벽
        depth = np.ones((self.height, self.width), dtype=np.float32) * 0.95

        # 바닥면: 아래 행일수록 가까워짐 (원근감)
        y_idx = np.linspace(0, 1, self.height).reshape(-1, 1)
        floor = 0.3 + 0.5 * (1.0 - y_idx)          # top=0.8(멀), bottom=0.3(가까움)
        # 화면 하단 30%만 바닥으로 처리
        floor_mask = y_idx > 0.7
        depth = np.where(floor_mask, np.minimum(depth, floor), depth)

        # 물체들 업데이트 & 렌더링
        xs = np.linspace(0, 1, self.width)
        ys = np.linspace(0, 1, self.height)
        XX, YY = np.meshgrid(xs, ys)

        for obj in self._objects:
            # 이동
            obj['cx'] += obj['vx'] * 0.016
            obj['cy'] += obj['vy'] * 0.016
            # 경계 반사
            if obj['cx'] < 0 or obj['cx'] > 1:
                obj['vx'] *= -1
                obj['cx'] = np.clip(obj['cx'], 0, 1)
            if obj['cy'] < 0 or obj['cy'] > 1:
                obj['vy'] *= -1
                obj['cy'] = np.clip(obj['cy'], 0, 1)

            # 타원형 물체 (가로로 약간 납작하게)
            dist2 = ((XX - obj['cx']) / (obj['r'] * 1.5)) ** 2 + \
                    ((YY - obj['cy']) / obj['r']) ** 2
            obj_mask = dist2 < 1.0
            # 물체 내부 깊이: 중심에서 가장 가깝고 가장자리로 갈수록 멀어짐
            obj_depth = obj['depth'] + 0.1 * dist2
            depth = np.where(obj_mask, np.minimum(depth, obj_depth), depth)

        return depth

    @property
    def shape(self):
        return (self.height, self.width)


# ──────────────────────────────────────────────
# 2. 웹캠 소스 (흑백 밝기 → 깊이 근사)
# ──────────────────────────────────────────────

class WebcamSource:
    """
    웹캠 영상을 받아 밝기를 깊이로 근사한다.
    밝은 픽셀 = 가까움(0), 어두운 픽셀 = 멈(1).
    torch 없이 즉시 사용 가능.
    """

    def __init__(self, cam_index: int = 0, width: int = 64, height: int = 32):
        try:
            import cv2
            self._cv2 = cv2
        except ImportError:
            raise ImportError("opencv-python 설치 필요: pip install opencv-python")

        self._cap = cv2.VideoCapture(cam_index)
        if not self._cap.isOpened():
            raise RuntimeError(f"카메라 {cam_index}번을 열 수 없습니다.")
        self.width = width
        self.height = height

    def get_depth(self) -> np.ndarray:
        ret, frame = self._cap.read()
        if not ret:
            return np.ones((self.height, self.width), dtype=np.float32)
        gray = self._cv2.cvtColor(frame, self._cv2.COLOR_BGR2GRAY)
        resized = self._cv2.resize(gray, (self.width, self.height))
        # 밝음=0(가까움), 어둠=1(멀음)
        depth = 1.0 - resized.astype(np.float32) / 255.0
        return depth

    def release(self):
        self._cap.release()

    @property
    def shape(self):
        return (self.height, self.width)


# ──────────────────────────────────────────────
# 3. MiDaS AI 깊이 추정 소스
# ──────────────────────────────────────────────

class MiDaSSource:
    """
    MiDaS(Intel) 모델로 웹캠 영상에서 실제 상대 깊이를 추정한다.
    torch, torchvision 필요.
    """

    def __init__(self, cam_index: int = 0, width: int = 64, height: int = 32,
                 model_type: str = "MiDaS_small"):
        try:
            import torch
            import cv2
            self._torch = torch
            self._cv2 = cv2
        except ImportError:
            raise ImportError("torch, torchvision, opencv-python 설치 필요")

        self.width = width
        self.height = height
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

        print(f"[MiDaS] 모델 로드 중: {model_type} ...")
        self._model = torch.hub.load("intel-isl/MiDaS", model_type)
        self._model.to(self.device)
        self._model.eval()

        transforms = torch.hub.load("intel-isl/MiDaS", "transforms")
        self._transform = transforms.small_transform if "small" in model_type \
            else transforms.default_transform

        self._cap = cv2.VideoCapture(cam_index)
        if not self._cap.isOpened():
            raise RuntimeError(f"카메라 {cam_index}번을 열 수 없습니다.")
        print("[MiDaS] 준비 완료")

    def get_depth(self) -> np.ndarray:
        import torch
        ret, frame = self._cap.read()
        if not ret:
            return np.ones((self.height, self.width), dtype=np.float32)

        img_rgb = self._cv2.cvtColor(frame, self._cv2.COLOR_BGR2RGB)
        input_batch = self._transform(img_rgb).to(self.device)

        with torch.no_grad():
            prediction = self._model(input_batch)
            prediction = torch.nn.functional.interpolate(
                prediction.unsqueeze(1),
                size=(self.height, self.width),
                mode="bicubic",
                align_corners=False,
            ).squeeze()

        depth_np = prediction.cpu().numpy().astype(np.float32)
        # MiDaS 출력: 큰 값 = 가까움 → 정규화 후 반전
        d_min, d_max = depth_np.min(), depth_np.max()
        if d_max > d_min:
            depth_np = (depth_np - d_min) / (d_max - d_min)
        depth_np = 1.0 - depth_np  # 가까움=0, 멀음=1
        return depth_np

    def release(self):
        self._cap.release()

    @property
    def shape(self):
        return (self.height, self.width)
