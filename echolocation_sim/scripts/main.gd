extends Node3D
# ─────────────────────────────────────────────
# main.gd  – 씬 전체를 코드로 생성
# Godot 에디터에서 main.tscn 을 열고 실행(F5)하면 됩니다.
# ─────────────────────────────────────────────

var _player    : CharacterBody3D
var _echo      : Node3D
var _audio     : Node
var _heatmap   : Node2D
var _settings  : Control
var _mode_label: Label

func _ready():
	_build_world()
	_build_player()
	_build_hud()
	_wire_signals()

func _process(_delta: float):
	# 구멍에 빠지면 시작 지점으로 리스폰
	if _player != null and _player.position.y < -1.5:
		_player.position = Vector3(0, 1.0, 0)
		_player.velocity = Vector3.ZERO

# ── 월드 ──────────────────────────────────────
func _build_world():
	# ── 바닥 (50×50, 구멍 2개 제외) ──────────
	# 구멍1: x(6~12), z(-12~-6)  ← 북동
	# 구멍2: x(-12~-6), z(6~12)  ← 남서
	_add_box(Vector3(  0,  -0.1, -22.5), Vector3(50, 0.2,  5))   # 최북단 띠
	_add_box(Vector3(  0,  -0.1,   0  ), Vector3(50, 0.2, 12))   # 중앙 띠
	_add_box(Vector3(  0,  -0.1,  22.5), Vector3(50, 0.2,  5))   # 최남단 띠
	_add_box(Vector3( -4.5,-0.1,  -9  ), Vector3(21, 0.2,  6))   # 북 좌측 (구멍1 서쪽)
	_add_box(Vector3( 13.5,-0.1,  -9  ), Vector3(23, 0.2,  6))   # 북 우측 (구멍1 동쪽)
	_add_box(Vector3(-13.5,-0.1,   9  ), Vector3(23, 0.2,  6))   # 남 좌측 (구멍2 서쪽)
	_add_box(Vector3(  4.5,-0.1,   9  ), Vector3(21, 0.2,  6))   # 남 우측 (구멍2 동쪽)
	_add_box(Vector3(  0,  -0.1, -17  ), Vector3(50, 0.2,  6))   # 북 중간 띠
	_add_box(Vector3(  0,  -0.1,  17  ), Vector3(50, 0.2,  6))   # 남 중간 띠

	# ── 구멍 바닥 ──────────────────────────────
	_add_box(Vector3(  9, -4.0,  -9), Vector3(6, 0.2, 6))
	_add_box(Vector3( -9, -4.0,   9), Vector3(6, 0.2, 6))

	# ── 외벽 (50×50) ────────────────────────
	_add_box(Vector3(  0, 1.5, -25), Vector3(50, 3, 0.3))
	_add_box(Vector3(  0, 1.5,  25), Vector3(50, 3, 0.3))
	_add_box(Vector3(-25, 1.5,   0), Vector3(0.3, 3, 50))
	_add_box(Vector3( 25, 1.5,   0), Vector3(0.3, 3, 50))

	# ── 기존 박스 기둥 5개 ────────────────────
	_add_box(Vector3( -6, 2.5,  -2), Vector3(0.5, 5.0, 0.5))
	_add_box(Vector3(  7, 2.5,  -7), Vector3(0.4, 5.0, 0.4))
	_add_box(Vector3(  3, 3.0,   8), Vector3(0.5, 6.0, 0.5))
	_add_box(Vector3(-11, 2.0, -11), Vector3(0.8, 4.0, 0.8))
	_add_box(Vector3( 11, 2.0,  11), Vector3(0.8, 4.0, 0.8))

	# ── 공중 부유 블록 5개 ──────────────────
	_add_box(Vector3( -5,  3.2,  -7), Vector3(2.0, 0.8, 1.5))
	_add_box(Vector3(  8,  2.8,   2), Vector3(1.5, 0.8, 2.0))
	_add_box(Vector3( -7,  3.0,   5), Vector3(1.2, 1.2, 1.2))
	_add_box(Vector3(  0,  2.75,-10), Vector3(3.5, 0.5, 1.0))
	_add_box(Vector3( -2,  3.5,   3), Vector3(1.5, 0.5, 1.5))

	# ── 일반 장애물 — 중앙 구역 ──────────────
	_add_box(Vector3( 2,  0.75, -3), Vector3(0.6, 1.5, 0.6))
	_add_box(Vector3(-3,  0.75,  1), Vector3(0.6, 1.5, 0.6))
	_add_box(Vector3( 0,  0.75, -5), Vector3(3.0, 1.5, 0.3))
	_add_box(Vector3(-4,  0.75, -4), Vector3(0.3, 1.5, 2.0))
	_add_box(Vector3( 5,  0.75,  3), Vector3(0.3, 1.5, 2.0))
	_add_box(Vector3( 0,  0.75,  5), Vector3(2.0, 1.5, 0.3))

	# ── 일반 장애물 — 구멍 주변 ──────────────
	_add_box(Vector3( 4,  0.75, -8), Vector3(1.5, 1.5, 1.5))
	_add_box(Vector3(13,  0.75, -4), Vector3(0.4, 1.5, 3.0))
	_add_box(Vector3(-2,  0.75,-11), Vector3(4.0, 1.5, 0.4))
	_add_box(Vector3(-4,  0.75,  8), Vector3(1.5, 1.5, 1.5))
	_add_box(Vector3(-13, 0.75,  4), Vector3(0.4, 1.5, 3.0))
	_add_box(Vector3( 2,  0.75, 11), Vector3(4.0, 1.5, 0.4))

	# ── 일반 장애물 — 외곽 구역 ──────────────
	_add_box(Vector3(-10, 0.75,-10), Vector3(2.0, 1.5, 0.5))
	_add_box(Vector3( 10, 0.75, 10), Vector3(2.0, 1.5, 0.5))
	_add_box(Vector3(-10, 0.75,  2), Vector3(0.5, 1.5, 4.0))
	_add_box(Vector3( 10, 0.75, -2), Vector3(0.5, 1.5, 4.0))

	# ── 확장 구역 장애물 (50×50 신규) ────────
	_add_box(Vector3( 18, 0.75,-18), Vector3(2.0, 1.5, 0.5))
	_add_box(Vector3(-18, 0.75, 18), Vector3(2.0, 1.5, 0.5))
	_add_box(Vector3( 18, 0.75, 18), Vector3(0.5, 1.5, 2.0))
	_add_box(Vector3(-18, 0.75,-18), Vector3(0.5, 1.5, 2.0))
	_add_box(Vector3(  0, 0.75,-20), Vector3(4.0, 1.5, 0.4))
	_add_box(Vector3(  0, 0.75, 20), Vector3(4.0, 1.5, 0.4))
	_add_box(Vector3(-20, 0.75,  0), Vector3(0.4, 1.5, 4.0))
	_add_box(Vector3( 20, 0.75,  0), Vector3(0.4, 1.5, 4.0))

	# ── 원기둥 장애물 4개 ────────────────────
	_add_cylinder(Vector3( -8, 1.5,   3), 0.5, 3.0)
	_add_cylinder(Vector3( 12, 1.5, -10), 0.6, 4.0)
	_add_cylinder(Vector3(-18, 1.5,  -8), 0.8, 4.0)
	_add_cylinder(Vector3( 18, 1.5,  12), 0.7, 3.5)

	# ── 스파이크 기둥 4개 ────────────────────
	_add_spike_pillar(Vector3(  5, 0.0, -15), 0.4, 3.0)
	_add_spike_pillar(Vector3( -5, 0.0,  15), 0.4, 3.0)
	_add_spike_pillar(Vector3( 15, 0.0,   5), 0.4, 3.0)
	_add_spike_pillar(Vector3(-15, 0.0,  -5), 0.4, 3.0)

	# ── 조명 ──────────────────────────────────
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-50, 30, 0)
	sun.light_energy = 1.2
	add_child(sun)

	var env_node := WorldEnvironment.new()
	var env := Environment.new()
	env.ambient_light_color = Color(0.25, 0.28, 0.35)
	env.ambient_light_energy = 0.6
	env_node.environment = env
	add_child(env_node)

func _add_box(pos: Vector3, size: Vector3) -> void:
	var box := CSGBox3D.new()
	box.size = size
	box.position = pos
	box.use_collision = true
	add_child(box)

func _add_cylinder(pos: Vector3, radius: float, height: float) -> void:
	var cyl := CSGCylinder3D.new()
	cyl.radius = radius
	cyl.height = height
	cyl.position = pos
	cyl.use_collision = true
	add_child(cyl)

func _add_spike_pillar(pos: Vector3, radius: float, height: float) -> void:
	# 기둥 몸체
	var body := CSGCylinder3D.new()
	body.radius = radius
	body.height = height
	body.position = Vector3(pos.x, pos.y + height / 2.0, pos.z)
	body.use_collision = true
	add_child(body)
	# 스파이크: 얇은 상자 2개를 X자로 교차
	var spike_y = pos.y + height + 0.4
	for angle in [0.0, 45.0]:
		var sp := CSGBox3D.new()
		sp.size = Vector3(radius * 4.0, 0.8, 0.08)
		sp.position = Vector3(pos.x, spike_y, pos.z)
		sp.rotation_degrees = Vector3(0, angle, 0)
		sp.use_collision = true
		add_child(sp)

# ── 플레이어 ───────────────────────────────────
func _build_player():
	_player = CharacterBody3D.new()
	_player.name = "Player"
	_player.position = Vector3(0, 1.0, 0)

	var shape := CollisionShape3D.new()
	var capsule := CapsuleShape3D.new()
	capsule.height = 1.8
	capsule.radius = 0.35
	shape.shape = capsule
	_player.add_child(shape)

	var camera := Camera3D.new()
	camera.name = "Camera3D"
	camera.position = Vector3(0, 0.7, 0)
	_player.add_child(camera)

	_echo = Node3D.new()
	_echo.name = "Echolocation"
	_echo.set_script(load("res://scripts/echolocation.gd"))
	camera.add_child(_echo)

	_audio = Node.new()
	_audio.name = "AudioFeedback"
	_audio.set_script(load("res://scripts/audio_feedback.gd"))
	_player.add_child(_audio)

	_player.set_script(load("res://scripts/player.gd"))
	add_child(_player)

# ── HUD ───────────────────────────────────────
func _build_hud():
	var canvas := CanvasLayer.new()
	canvas.name = "HUD"
	add_child(canvas)

	_heatmap = Node2D.new()
	_heatmap.name = "Heatmap"
	_heatmap.set_script(load("res://scripts/heatmap_overlay.gd"))
	canvas.add_child(_heatmap)

	_settings = Control.new()
	_settings.name = "Settings"
	_settings.set_script(load("res://scripts/settings_overlay.gd"))
	_settings.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	canvas.add_child(_settings)

	_mode_label = Label.new()
	_mode_label.position = Vector2(20, 300)
	_mode_label.add_theme_color_override("font_color", Color(1.0, 1.0, 0.4))
	_mode_label.add_theme_font_size_override("font_size", 14)
	_mode_label.text = "◉ [1] 동시재생   [2] vOICe 스캔   [3] 거리→버즈"
	canvas.add_child(_mode_label)

# ── 시그널 연결 ───────────────────────────────
func _wire_signals():
	call_deferred("_connect_after_ready")

func _connect_after_ready():
	_echo.depth_updated.connect(_audio.on_depth_updated)
	_echo.depth_updated.connect(_heatmap.on_depth_updated)

	_settings.params_changed.connect(_audio.set_params)
	_settings.params_changed.connect(_echo.set_params)
	_settings.params_changed.connect(_heatmap.set_params)

	var init_params: Dictionary = _settings.get_current_params()
	_audio.set_params(init_params)
	_echo.set_params(init_params)
	_heatmap.set_params(init_params)

func _input(event: InputEvent):
	if event.is_action_pressed("ui_cancel"):
		get_tree().quit()
	if event is InputEventKey and event.pressed and not event.echo:
		match event.keycode:
			KEY_1: _set_audio_mode(0)
			KEY_2: _set_audio_mode(1)
			KEY_3: _set_audio_mode(2)
			KEY_R:
				_player.position = Vector3(0, 1.0, 0)
				_player.velocity = Vector3.ZERO
			KEY_F4:
				if DisplayServer.window_get_mode() == DisplayServer.WINDOW_MODE_FULLSCREEN:
					DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
				else:
					DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN)

func _set_audio_mode(mode: int) -> void:
	_audio.set_sound_mode(mode)
	match mode:
		0: _mode_label.text = "◉ [1] 동시재생   [2] vOICe 스캔   [3] 거리→버즈"
		1: _mode_label.text = "  [1] 동시재생  ◉ [2] vOICe 스캔   [3] 거리→버즈"
		2: _mode_label.text = "  [1] 동시재생   [2] vOICe 스캔  ◉ [3] 거리→버즈"
