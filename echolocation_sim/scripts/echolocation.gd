extends Node3D
# ─────────────────────────────────────────────
# echolocation.gd
# 카메라 전방에 RayCast3D 격자를 배치해
# 5 FPS 주기로 깊이 그리드를 갱신하고 시그널 발행
# ─────────────────────────────────────────────

signal depth_updated(grid: Array)

## 격자 해상도 (col × row 개의 레이)
const GRID_COLS  := 7
const GRID_ROWS  := 5
## 수평 / 수직 시야각 (도)
const FOV_H      := 60.0
const FOV_V      := 40.0
## 실시간 조정 가능한 파라미터
var max_dist   := 5.0
var update_sec := 1.0 / 5.0

var _rays: Array = []   # [row][col] → RayCast3D
var _timer: float = 0.0

## settings_overlay에서 호출 — 즉시 반영
func set_params(params: Dictionary) -> void:
	if params.has("max_dist"):   max_dist   = params["max_dist"]
	if params.has("update_fps"): update_sec = 1.0 / params["update_fps"]

# 현재 깊이 그리드 (외부에서 읽기용)
var depth_grid: Array = []

func _ready():
	_build_rays()

func _build_rays():
	for r in range(GRID_ROWS):
		var row_arr := []
		for c in range(GRID_COLS):
			var ray := RayCast3D.new()
			add_child(ray)

			# 로컬 방향 벡터 계산
			var h_deg := lerp(-FOV_H * 0.5, FOV_H * 0.5,
							  float(c) / (GRID_COLS - 1))
			var v_deg := lerp( FOV_V * 0.3, -FOV_V * 0.5,
							  float(r) / (GRID_ROWS - 1))

			var dir := Vector3(
				sin(deg_to_rad(h_deg)),
				sin(deg_to_rad(v_deg)),
				-cos(deg_to_rad(h_deg)) * cos(deg_to_rad(v_deg))
			).normalized()

			ray.target_position = dir * max_dist
			ray.enabled = true
			row_arr.append(ray)
		_rays.append(row_arr)

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
			if ray.is_colliding():
				var d := ray.get_collision_point().distance_to(global_position)
				row_dist.append(clamp(d, 0.01, max_dist))
			else:
				row_dist.append(max_dist)
		depth_grid.append(row_dist)

	emit_signal("depth_updated", depth_grid)
