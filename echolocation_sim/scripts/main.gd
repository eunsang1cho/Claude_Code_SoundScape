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
# 구역 배치 (50×50 맵, 원점=중앙):
#   중앙 광장    : x=[-8, 8],  z=[-8, 6]
#   집 (NE)      : x=[10,18],  z=[-22,-14]  (문: z=-14, x=[13,15.5])
#   긴 골목길 (W): x=[-16,-13], z=[-22, 2]  (3m 폭 × 24m)
#   계단+고가(S) : x=[-2, 2],   z=[7,23]    (올라가기 → 플랫폼 → 내려가기)
#   구멍 (NE중간): x=[6,12],    z=[-12,-6]
func _build_world():
	_build_floor()
	_build_outer_walls()
	_build_house()
	_build_alleyway()
	_build_staircase()
	_build_obstacles()
	_build_lighting()

# ── 바닥: 50×50, 구멍 x=[6,12] z=[-12,-6] ───
func _build_floor():
	# 구멍을 피하는 4개 타일
	_add_box(Vector3(  0,   -0.1, -18.5), Vector3(50, 0.2, 13))  # z<-12 전체
	_add_box(Vector3(  0,   -0.1,   9.5), Vector3(50, 0.2, 31))  # z>-6  전체
	_add_box(Vector3( -9.5, -0.1,  -9  ), Vector3(31, 0.2,  6))  # z=[-12,-6] x<6
	_add_box(Vector3( 18.5, -0.1,  -9  ), Vector3(13, 0.2,  6))  # z=[-12,-6] x>12
	# 구멍 바닥 (4m 아래)
	_add_box(Vector3(  9,   -4.0,  -9  ), Vector3( 6, 0.2,  6))

# ── 외벽 (50×50) ─────────────────────────────
func _build_outer_walls():
	_add_box(Vector3(  0, 1.5, -25), Vector3(50, 3, 0.3))
	_add_box(Vector3(  0, 1.5,  25), Vector3(50, 3, 0.3))
	_add_box(Vector3(-25, 1.5,   0), Vector3(0.3, 3, 50))
	_add_box(Vector3( 25, 1.5,   0), Vector3(0.3, 3, 50))

# ── 문 있는 집 (NE 구역) ──────────────────────
# 외벽 8×8 (x=[10,18], z=[-22,-14]), 앞면 z=-14에 문(x=[13,15.5])
# 내부 칸막이 z=-18, 통로 x=[12.5,14.5]
func _build_house():
	var wh := 3.0;  var wt := 0.3
	# 후면 벽 (z=-22, 북)
	_add_box(Vector3( 14,   wh/2, -22  ), Vector3(8.0, wh, wt))
	# 좌측 벽 (x=10)
	_add_box(Vector3( 10,   wh/2, -18  ), Vector3(wt,  wh, 8.0))
	# 우측 벽 (x=18)
	_add_box(Vector3( 18,   wh/2, -18  ), Vector3(wt,  wh, 8.0))
	# 전면 벽 (z=-14, 남) — 문 x=[13,15.5] 폭 2.5m, 높이 2.5m
	_add_box(Vector3( 11.5,  wh/2, -14 ), Vector3(3.0, wh,  wt))   # 문 왼쪽
	_add_box(Vector3( 16.75, wh/2, -14 ), Vector3(2.5, wh,  wt))   # 문 오른쪽
	_add_box(Vector3( 14.25, 2.75, -14 ), Vector3(2.5, 0.5, wt))   # 인방(lintel)
	# 내부 칸막이 (z=-18), 통로 x=[12.5,14.5]
	_add_box(Vector3( 11.25, wh/2, -18 ), Vector3(2.5, wh,  wt))   # 칸막이 좌
	_add_box(Vector3( 16.25, wh/2, -18 ), Vector3(3.5, wh,  wt))   # 칸막이 우
	# 내부 가구형 장애물 (소나 감지 연습)
	_add_box(Vector3( 12.0,  0.5,  -20 ), Vector3(1.5, 1.0, 0.8))  # 방 뒤쪽 물체
	_add_box(Vector3( 16.5,  0.75, -16 ), Vector3(0.4, 1.5, 0.4))  # 방 앞쪽 기둥
	_add_box(Vector3( 14.0,  2.5,  -20 ), Vector3(2.0, 0.3, 1.5))  # 공중 선반

# ── 긴 골목길 (W 구역) ────────────────────────
# 서벽 x=-16.15, 동벽 x=-12.85, 내부 폭 3m, 길이 24m (z=-22~2)
# 북쪽 끝 막힘, 남쪽 끝 개방 (광장 연결)
func _build_alleyway():
	var wh := 3.0;  var wt := 0.3
	var az_c := -10.0;  var a_len := 24.0
	# 서쪽 벽 / 동쪽 벽
	_add_box(Vector3(-16.15, wh/2, az_c), Vector3(wt, wh, a_len))
	_add_box(Vector3(-12.85, wh/2, az_c), Vector3(wt, wh, a_len))
	# 북쪽 막힌 끝 (z=-22)
	_add_box(Vector3(-14.5,  wh/2, -22 ), Vector3(3.6, wh, wt))
	# 골목 내 낮은 턱 (바닥 장애물)
	_add_box(Vector3(-14.5,  0.15, -14 ), Vector3(3.0, 0.3, 0.4))
	_add_box(Vector3(-14.5,  0.15,  -4 ), Vector3(3.0, 0.3, 0.4))
	# 벽에서 돌출된 장벽 → 지그재그로 걸어야 함
	_add_box(Vector3(-15.7,  1.5,   -9 ), Vector3(0.9, 3.0, 0.25))  # 서벽 돌출
	_add_box(Vector3(-13.3,  1.5,   -6 ), Vector3(0.9, 3.0, 0.25))  # 동벽 돌출

# ── 계단 + 고가 플랫폼 (S 구역) ───────────────
# 올라가기: z=[7,11] (10계단 × 0.25m 높이 × 0.4m 깊이 = 2.5m)
# 플랫폼:   z=[11,19], y=2.5m
# 내려가기: z=[19,23]
func _build_staircase():
	var sw    := 4.0    # 계단 폭 (x: -2~+2)
	var sh    := 0.25   # 한 계단 높이 (CharacterBody3D 기본 허용 범위)
	var sd    := 0.4    # 한 계단 깊이
	var ns    := 10     # 계단 수
	var total := ns * sh        # 2.5m
	var up_z0 := 7.0
	var dn_z0 := 19.0

	# 올라가는 계단 (z 증가 → y 증가)
	for i in range(ns):
		var ch := (i + 1) * sh
		_add_box(Vector3(0, ch / 2.0, up_z0 + i * sd + sd / 2.0), Vector3(sw, ch, sd))

	# 고가 플랫폼 (y=2.5 위, z=11~19)
	_add_box(Vector3(0, total + 0.1, 15.0), Vector3(sw + 2.0, 0.2, 8.0))

	# 내려가는 계단 (z 증가 → y 감소)
	for i in range(ns):
		var ch := (ns - i) * sh
		_add_box(Vector3(0, ch / 2.0, dn_z0 + i * sd + sd / 2.0), Vector3(sw, ch, sd))

	# 계단 가이드 벽 (올라가는 쪽)
	var gwh   := total + 0.6
	var gz_up := up_z0 + float(ns) * sd / 2.0   # = 9.0
	_add_box(Vector3(-2.4, gwh / 2.0, gz_up), Vector3(0.25, gwh, float(ns) * sd))
	_add_box(Vector3( 2.4, gwh / 2.0, gz_up), Vector3(0.25, gwh, float(ns) * sd))

	# 고가 플랫폼 난간
	_add_box(Vector3(-3.3, total + 0.6, 15.0), Vector3(0.2, 1.0, 8.0))
	_add_box(Vector3( 3.3, total + 0.6, 15.0), Vector3(0.2, 1.0, 8.0))

	# 계단 가이드 벽 (내려가는 쪽)
	var gz_dn := dn_z0 + float(ns) * sd / 2.0   # = 21.0
	_add_box(Vector3(-2.4, gwh / 2.0, gz_dn), Vector3(0.25, gwh, float(ns) * sd))
	_add_box(Vector3( 2.4, gwh / 2.0, gz_dn), Vector3(0.25, gwh, float(ns) * sd))

	# 플랫폼 위 장애물 (소나 연습)
	_add_box(Vector3(-1.0, total + 1.2, 13.5), Vector3(0.4, 2.4, 0.4))   # 기둥
	_add_box(Vector3( 1.0, total + 1.2, 16.5), Vector3(0.4, 2.4, 0.4))   # 기둥
	_add_box(Vector3( 0.0, total + 0.9, 15.0), Vector3(3.0, 0.3, 1.5))   # 공중 보

# ── 개방 구역 장애물 (중앙 광장 + 외곽) ─────────
func _build_obstacles():
	# 중앙 광장
	_add_cylinder(Vector3(-5, 1.5, -3), 0.4, 3.0)
	_add_cylinder(Vector3( 5, 1.5,  3), 0.4, 3.0)
	_add_box(Vector3( 0,  0.75, -4), Vector3(3.0, 1.5, 0.3))   # 수평 벽
	_add_box(Vector3(-4,  0.75,  0), Vector3(0.3, 1.5, 3.0))   # 수직 벽
	_add_box(Vector3( 4,  0.75,  4), Vector3(1.5, 1.5, 1.5))   # 큐브
	# 구멍 주변 경고 마커
	_add_box(Vector3( 4,  0.75, -7), Vector3(1.0, 1.5, 0.3))
	_add_box(Vector3(14,  0.75,-11), Vector3(0.3, 1.5, 2.0))
	# 외곽 장애물
	_add_box(Vector3(-20, 0.75,-12), Vector3(2.0, 1.5, 0.5))
	_add_box(Vector3( 20, 0.75, -5), Vector3(0.5, 1.5, 4.0))
	_add_cylinder(Vector3(-18, 1.5, 8), 0.7, 3.5)
	_add_cylinder(Vector3( 18, 1.5,-15), 0.6, 4.0)
	_add_spike_pillar(Vector3(-5,  0.0, -17), 0.4, 3.0)
	_add_spike_pillar(Vector3( 20, 0.0,  10), 0.4, 3.0)
	# 공중 부유 블록 (소나 감지 연습)
	_add_box(Vector3(-6, 3.0, -7), Vector3(2.0, 0.6, 1.5))
	_add_box(Vector3( 8, 2.8,  2), Vector3(1.5, 0.6, 2.0))

# ── 조명 ──────────────────────────────────────
func _build_lighting():
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
			KEY_4: _set_audio_mode(3)
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
		0: _mode_label.text = "◉ [1] 동시재생   [2] vOICe   [3] 버즈   [4] 그레인"
		1: _mode_label.text = "  [1] 동시재생  ◉ [2] vOICe   [3] 버즈   [4] 그레인"
		2: _mode_label.text = "  [1] 동시재생   [2] vOICe  ◉ [3] 버즈   [4] 그레인"
		3: _mode_label.text = "  [1] 동시재생   [2] vOICe   [3] 버즈  ◉ [4] 그레인"
