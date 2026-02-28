"""
echolocation_sim 로직 검증 스크립트 (Godot 없이 실행)
플랫폼 독립적인 수학/로직 파트를 Python으로 재현하여 테스트
"""

import math
import re
import sys
from pathlib import Path

PASS = "\033[92m[PASS]\033[0m"
FAIL = "\033[91m[FAIL]\033[0m"
INFO = "\033[94m[INFO]\033[0m"

errors = 0

def check(cond: bool, label: str, detail: str = ""):
    global errors
    if cond:
        print(f"  {PASS} {label}")
    else:
        print(f"  {FAIL} {label}" + (f"\n        {detail}" if detail else ""))
        errors += 1

def section(title: str):
    print(f"\n{'='*55}")
    print(f"  {title}")
    print(f"{'='*55}")

# ─────────────────────────────────────────────
# 1. 파일 존재 확인
# ─────────────────────────────────────────────
section("1. 파일 존재 확인")

expected_files = [
    "project.godot",
    "main.tscn",
    "scripts/main.gd",
    "scripts/player.gd",
    "scripts/echolocation.gd",
    "scripts/audio_feedback.gd",
    "scripts/heatmap_overlay.gd",
]
base = Path(__file__).parent
for f in expected_files:
    p = base / f
    check(p.exists() and p.stat().st_size > 0, f"{f} 존재·비어있지 않음")

# ─────────────────────────────────────────────
# 2. 시그널 이름 일관성
# ─────────────────────────────────────────────
section("2. 시그널 이름 일관성")

echo_src  = (base / "scripts/echolocation.gd").read_text()
audio_src = (base / "scripts/audio_feedback.gd").read_text()
heatmap_src = (base / "scripts/heatmap_overlay.gd").read_text()
main_src  = (base / "scripts/main.gd").read_text()

# echolocation.gd 에서 시그널 선언
check("signal depth_updated" in echo_src,
      "echolocation.gd: depth_updated 시그널 선언")

# echolocation.gd 에서 emit_signal
check('emit_signal("depth_updated"' in echo_src or
      "emit_signal(\"depth_updated\"" in echo_src,
      "echolocation.gd: depth_updated emit")

# audio_feedback.gd 에 수신 함수
check("func on_depth_updated" in audio_src,
      "audio_feedback.gd: on_depth_updated 함수 존재")

# heatmap_overlay.gd 에 수신 함수
check("func on_depth_updated" in heatmap_src,
      "heatmap_overlay.gd: on_depth_updated 함수 존재")

# main.gd 에서 연결
check("on_depth_updated" in main_src,
      "main.gd: on_depth_updated 연결 코드 존재")

# ─────────────────────────────────────────────
# 3. 레이캐스트 방향 벡터 수학
# ─────────────────────────────────────────────
section("3. 레이캐스트 방향 벡터 (7×5 격자)")

GRID_COLS = 7
GRID_ROWS = 5
FOV_H     = 60.0
FOV_V     = 40.0
MAX_DIST  = 5.0

def make_direction(c, r):
    h_deg = -FOV_H/2 + (FOV_H / (GRID_COLS - 1)) * c
    v_deg = FOV_V*0.3 - (FOV_V*0.8 / (GRID_ROWS - 1)) * r   # row 0 위쪽
    h = math.radians(h_deg)
    v = math.radians(v_deg)
    x = math.sin(h)
    y = math.sin(v)
    z = -math.cos(h) * math.cos(v)
    length = math.sqrt(x*x + y*y + z*z)
    return (x/length, y/length, z/length)

# 총 49개 레이 생성
rays = [[make_direction(c, r) for c in range(GRID_COLS)]
        for r in range(GRID_ROWS)]

# 모든 방향 벡터가 정규화되어 있는지
all_normalized = all(
    abs(math.sqrt(x*x + y*y + z*z) - 1.0) < 1e-9
    for row in rays for (x, y, z) in row
)
check(all_normalized, "모든 방향 벡터가 단위벡터")

# 전방 벡터(중앙)는 -Z 방향이어야 함
cx, cy, cz = rays[GRID_ROWS//2][GRID_COLS//2]
check(abs(cx) < 0.05 and cz < -0.9,
      f"중앙 레이 전방(-Z) 방향  cx={cx:.3f} cz={cz:.3f}")

# 왼쪽 끝 레이는 x가 음수
lx, _, lz = rays[GRID_ROWS//2][0]
check(lx < -0.4, f"왼쪽 끝 레이 x={lx:.3f} (음수여야 함)")

# 오른쪽 끝 레이는 x가 양수
rx, _, rz = rays[GRID_ROWS//2][GRID_COLS-1]
check(rx > 0.4, f"오른쪽 끝 레이 x={rx:.3f} (양수여야 함)")

# 수평 FOV 확인 (좌우 끝 사이 각도)
dot = lx*rx + 0 + lz*rz   # 두 벡터 내적
angle_deg = math.degrees(math.acos(max(-1, min(1, dot))))
check(abs(angle_deg - FOV_H) < 2.0,
      f"수평 FOV ≈ {FOV_H}°  실측={angle_deg:.1f}°")

print(f"  {INFO} 총 레이 수: {GRID_ROWS}×{GRID_COLS} = {GRID_ROWS*GRID_COLS}개")

# ─────────────────────────────────────────────
# 4. 오디오 존 분류 로직
# ─────────────────────────────────────────────
section("4. 오디오 존 분류 (7열 → 좌/중/우)")

def classify_zone(c, cols=7):
    if c <= 1:
        return 0   # 왼쪽
    elif c >= cols - 2:
        return 2   # 오른쪽
    else:
        return 1   # 중앙

expected_zones = [0, 0, 1, 1, 1, 2, 2]
actual_zones   = [classify_zone(c) for c in range(7)]
check(actual_zones == expected_zones,
      f"7열 존 분류  {actual_zones}")

# 각 존에 열이 최소 1개 이상 포함되는지
check(0 in actual_zones and 1 in actual_zones and 2 in actual_zones,
      "세 존 모두 최소 1개 이상의 열 포함")

# ─────────────────────────────────────────────
# 5. 주파수/진폭 매핑 (오디오 피드백)
# ─────────────────────────────────────────────
section("5. 주파수·진폭 매핑 (거리 → 음)")

ZONE_FREQ = [[250.0, 800.0], [500.0, 1200.0], [350.0, 900.0]]

def audio_map(dist: float, zone: int):
    t = 1.0 - max(0.0, min(1.0, dist / MAX_DIST))
    freq = ZONE_FREQ[zone][0] + (ZONE_FREQ[zone][1] - ZONE_FREQ[zone][0]) * (t*t)
    amp  = 0.30 * t
    return freq, amp

# 거리 0 → 최대 진폭, 최고 주파수
for zone in range(3):
    f0, a0 = audio_map(0.0, zone)
    f5, a5 = audio_map(5.0, zone)
    check(f0 == ZONE_FREQ[zone][1] and abs(a0 - 0.30) < 1e-9,
          f"존{zone} 거리=0  freq={f0:.0f}Hz  amp={a0:.3f}")
    check(f5 == ZONE_FREQ[zone][0] and a5 == 0.0,
          f"존{zone} 거리=5  freq={f5:.0f}Hz  amp={a5:.3f}")

# 단조성: 거리가 가까울수록 주파수·진폭이 증가하는지
for zone in range(3):
    freqs = [audio_map(d, zone)[0] for d in [0, 1, 2, 3, 4, 5]]
    amps  = [audio_map(d, zone)[1] for d in [0, 1, 2, 3, 4, 5]]
    freq_mono = all(freqs[i] >= freqs[i+1] for i in range(len(freqs)-1))
    amp_mono  = all(amps[i]  >= amps[i+1]  for i in range(len(amps)-1))
    check(freq_mono, f"존{zone} 주파수 단조 감소(거리↑→주파수↓)  {[f'{f:.0f}' for f in freqs]}")
    check(amp_mono,  f"존{zone} 진폭  단조 감소(거리↑→진폭↓)")

# ─────────────────────────────────────────────
# 6. 히트맵 컬러 매핑
# ─────────────────────────────────────────────
section("6. 히트맵 컬러 매핑 (거리 → 색상)")

def dist_to_color(t: float):
    def lerp_color(a, b, f):
        return tuple(a[i] + (b[i]-a[i])*f for i in range(3))
    RED    = (1.0, 0.0, 0.0)
    YELLOW = (1.0, 1.0, 0.0)
    GREEN  = (0.0, 1.0, 0.0)
    BLUE   = (0.2, 0.4, 1.0)
    if t < 0.33:
        return lerp_color(RED, YELLOW, t / 0.33)
    elif t < 0.66:
        return lerp_color(YELLOW, GREEN, (t - 0.33) / 0.33)
    else:
        return lerp_color(GREEN, BLUE, (t - 0.66) / 0.34)

c0 = dist_to_color(0.0)    # 가까움 → 빨강
c5 = dist_to_color(1.0)    # 멀음   → 파랑
c_mid = dist_to_color(0.66) # 중간   → 초록~파랑 경계

check(c0 == (1.0, 0.0, 0.0), f"t=0 (가까움) = RED {c0}")
check(abs(c5[2] - 1.0) < 0.01, f"t=1 (멀음) 파란 성분 ≈ 1.0  blue={c5[2]:.2f}")

# 모든 채널 0~1 범위
all_valid = True
for t in [i/20 for i in range(21)]:
    r, g, b = dist_to_color(t)
    if not (0 <= r <= 1 and 0 <= g <= 1 and 0 <= b <= 1):
        all_valid = False
        break
check(all_valid, "모든 t∈[0,1] 에서 RGB 채널 0~1 범위 유지")

print(f"  {INFO} 샘플 컬러:")
for d, label in [(0.0, "0m 가까움"), (2.5, "2.5m 중간"), (5.0, "5m 멈")]:
    t = d / MAX_DIST
    r, g, b = dist_to_color(t)
    print(f"       {label:12s}  t={t:.2f}  R={r:.2f} G={g:.2f} B={b:.2f}")

# ─────────────────────────────────────────────
# 7. 스테레오 패닝 검증
# ─────────────────────────────────────────────
section("7. 스테레오 패닝 (좌/중/우 채널 비율)")

ZONE_PAN = [[1.0, 0.15], [0.7, 0.7], [0.15, 1.0]]

check(ZONE_PAN[0][0] > ZONE_PAN[0][1],
      f"존0(왼쪽)  L={ZONE_PAN[0][0]} > R={ZONE_PAN[0][1]}  좌 강조")
check(abs(ZONE_PAN[1][0] - ZONE_PAN[1][1]) < 0.01,
      f"존1(중앙)  L={ZONE_PAN[1][0]} = R={ZONE_PAN[1][1]}  대칭")
check(ZONE_PAN[2][1] > ZONE_PAN[2][0],
      f"존2(오른쪽) L={ZONE_PAN[2][0]} < R={ZONE_PAN[2][1]}  우 강조")

# ─────────────────────────────────────────────
# 8. 업데이트 주기 상수 검증
# ─────────────────────────────────────────────
section("8. 업데이트 주기 / 상수 검증")

UPDATE_SEC = 1.0 / 5.0
check(abs(UPDATE_SEC - 0.2) < 1e-9, f"UPDATE_SEC = {UPDATE_SEC}s → 5fps")

# echolocation.gd 소스에서 상수 추출 확인
check("GRID_COLS  := 7" in echo_src or "GRID_COLS := 7" in echo_src,
      "echolocation.gd: GRID_COLS=7 확인")
check("GRID_ROWS  := 5" in echo_src or "GRID_ROWS := 5" in echo_src,
      "echolocation.gd: GRID_ROWS=5 확인")
check("MAX_DIST   := 5.0" in echo_src or "MAX_DIST := 5.0" in echo_src,
      "echolocation.gd: MAX_DIST=5.0 확인")
check("UPDATE_SEC := " in echo_src or "UPDATE_SEC :=" in echo_src,
      "echolocation.gd: UPDATE_SEC 상수 존재")

# ─────────────────────────────────────────────
# 결과 요약
# ─────────────────────────────────────────────
print(f"\n{'='*55}")
if errors == 0:
    print(f"  \033[92m모든 검증 통과!  errors=0\033[0m")
else:
    print(f"  \033[91m실패 {errors}건  – 위 FAIL 항목 확인\033[0m")
print(f"{'='*55}\n")
sys.exit(1 if errors > 0 else 0)
