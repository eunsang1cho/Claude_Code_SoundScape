extends Node2D
# ─────────────────────────────────────────────
# heatmap_overlay.gd
# 깊이 그리드를 화면 좌상단에 컬러 히트맵으로 표시
# H 키로 on/off 토글
# ─────────────────────────────────────────────

var max_dist    := 5.0
const CELL_W    := 18
const CELL_H    := 15
const OFFSET    := Vector2(12, 12)
const FONT_SIZE := 7

var _grid: Array = []
var _visible_heatmap: bool = true

func set_params(params: Dictionary) -> void:
	if params.has("max_dist"):
		max_dist = params["max_dist"]
		queue_redraw()

func _ready():
	# CanvasLayer 최상단에 표시
	z_index = 100

func on_depth_updated(grid: Array) -> void:
	_grid = grid
	queue_redraw()

func _input(event: InputEvent):
	if event.is_action_pressed("toggle_heatmap"):
		_visible_heatmap = !_visible_heatmap
		queue_redraw()

func _draw():
	if not _visible_heatmap or _grid.is_empty():
		return

	var rows: int = _grid.size()
	var cols: int = _grid[0].size()

	# 배경 반투명 패널
	draw_rect(
		Rect2(OFFSET - Vector2(4, 4),
			  Vector2(cols * CELL_W + 8, rows * CELL_H + 24)),
		Color(0, 0, 0, 0.55)
	)

	# 셀 그리기
	for r in range(rows):
		for c in range(cols):
			var dist: float = _grid[r][c]
			var t: float = clamp(dist / max_dist, 0.0, 1.0)
			var color: Color = _dist_to_color(t)
			var rect := Rect2(
				OFFSET + Vector2(c * CELL_W, r * CELL_H),
				Vector2(CELL_W - 2, CELL_H - 2)
			)
			draw_rect(rect, color)

	# 범례
	_draw_legend(OFFSET + Vector2(0, rows * CELL_H + 6))

func _dist_to_color(t: float) -> Color:
	# t=0 (가까움) → 빨강,  t=1 (멀음) → 파랑
	if t < 0.33:
		return Color.RED.lerp(Color.YELLOW, t / 0.33)
	elif t < 0.66:
		return Color.YELLOW.lerp(Color.GREEN, (t - 0.33) / 0.33)
	else:
		return Color.GREEN.lerp(Color(0.2, 0.4, 1.0), (t - 0.66) / 0.34)

func _draw_legend(pos: Vector2):
	var legend := "■ 빨강=가까움  ■ 초록=중간  ■ 파랑=멈  [H] 토글"
	draw_string(
		ThemeDB.fallback_font,
		pos, legend,
		HORIZONTAL_ALIGNMENT_LEFT, -1, 10,
		Color(1, 1, 1, 0.7)
	)
