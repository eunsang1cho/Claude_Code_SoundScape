extends Node3D
# ─────────────────────────────────────────────
# echolocation.gd
# 카메라 전방에 RayCast3D 격자를 배치해
# 5 FPS 주기로 깊이 그리드를 갱신하고 시그널 발행
# ─────────────────────────────────────────────

signal depth_updated(grid: Array)

## 격자 해상도 (col × row 개의 레이) — 히트맵 시각 해상도
const GRID_COLS  := 21
const GRID_ROWS  := 15
## 수평 / 수직 시야각 (도)
const FOV_H      := 60.0
const FOV_V      := 40.0
## 이 미터 이내 편차는 평지로 간주 → 무음
const FLOOR_DEVIATION_THRESHOLD := 0.35
## 실시간 조정 가능한 파라미터
var max_dist   := 5.0
var update_sec := 1.0 / 5.0

var _rays    : Array = []   # [row][col] → RayCast3D
var _ray_dirs: Array = []   # [row][col] → Vector3 로컬 방향
var _timer   : float = 0.0

## settings_overlay에서 호출 — 즉시 반영
func set_params(params: Dictionary) -> void:
	if params.has("max_dist"):   max_dist   = params["max_dist"]
	if params.has("update_fps"): update_sec = 1.0 / params["update_fps"]

# 현재 깊이 그리드 (외부에서 읽기용)
var depth_grid: Array = []

func _ready():
	_build_rays()

func _build_rays():
	_ray_dirs.clear()
	for r in range(GRID_ROWS):
		var row_arr := []
		var dir_row := []
		for c in range(GRID_COLS):
			var ray := RayCast3D.new()
			add_child(ray)

			# 로컬 방향 벡터 계산
			var h_deg: float = lerp(-FOV_H * 0.5, FOV_H * 0.5,
							  float(c) / (GRID_COLS - 1))
			var v_deg: float = lerp( FOV_V * 0.2, -FOV_V * 0.75,
							  float(r) / (GRID_ROWS - 1))

			var dir := Vector3(
				sin(deg_to_rad(h_deg)),
				sin(deg_to_rad(v_deg)),
				-cos(deg_to_rad(h_deg)) * cos(deg_to_rad(v_deg))
			).normalized()

			ray.target_position = dir * max_dist
			ray.enabled = true
			row_arr.append(ray)
			dir_row.append(dir)
		_rays.append(row_arr)
		_ray_dirs.append(dir_row)

func _process(delta: float):
	_timer += delta
	if _timer >= update_sec:
		_timer = 0.0
		_scan()

func _scan():
	depth_grid = []
	for r in range(GRID_ROWS):
		var row_dist := []
		for c in range(GRID_COLS):
			var ray: RayCast3D = _rays[r][c]

			# 월드 방향으로 예상 바닥 거리 계산 (바닥 y=0 기준)
			var local_dir : Vector3 = _ray_dirs[r][c]
			var world_dir : Vector3 = global_transform.basis * local_dir
			var down_sin  : float   = -world_dir.y   # 양수=아래 방향
			var d_floor   : float
			if down_sin > 0.01:
				d_floor = min(global_position.y / down_sin, max_dist)
			else:
				d_floor = max_dist   # 위/수평 레이 → 바닥 미도달

			var d_actual: float
			if ray.is_colliding():
				d_actual = clamp(
					ray.get_collision_point().distance_to(global_position),
					0.01, max_dist)
			else:
				d_actual = max_dist

			# 편차: 양수=돌출, 음수=함몰
			var dev: float = d_floor - d_actual
			if abs(dev) < FLOOR_DEVIATION_THRESHOLD:
				row_dist.append(max_dist)    # 평지 → 묵음 신호
			elif dev > 0.0:
				row_dist.append(d_actual)    # 돌출 → 실제 거리
			else:
				row_dist.append(-abs(dev))   # 함몰(구멍) → 음수 신호
		depth_grid.append(row_dist)

	emit_signal("depth_updated", depth_grid)
