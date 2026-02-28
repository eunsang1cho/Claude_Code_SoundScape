extends Node3D
# ─────────────────────────────────────────────
# main.gd  – 씬 전체를 코드로 생성
# Godot 에디터에서 main.tscn 을 열고 실행(F5)하면 됩니다.
# ─────────────────────────────────────────────

var _player: CharacterBody3D
var _echo: Node3D
var _audio: Node
var _heatmap: Node2D
var _settings: Control

func _ready():
	_build_world()
	_build_player()
	_build_hud()
	_wire_signals()

# ── 월드 ──────────────────────────────────────
func _build_world():
	# 바닥
	_add_box(Vector3(0, -0.1, 0), Vector3(30, 0.2, 30))

	# 외벽
	_add_box(Vector3(0,  1.5, -8), Vector3(16, 3, 0.3))
	_add_box(Vector3(0,  1.5,  8), Vector3(16, 3, 0.3))
	_add_box(Vector3(-8, 1.5,  0), Vector3(0.3, 3, 16))
	_add_box(Vector3( 8, 1.5,  0), Vector3(0.3, 3, 16))

	# 장애물들 (복도 느낌)
	_add_box(Vector3( 2, 0.75, -3), Vector3(0.6, 1.5, 0.6))
	_add_box(Vector3(-3, 0.75,  1), Vector3(0.6, 1.5, 0.6))
	_add_box(Vector3( 0, 0.75, -5), Vector3(3.0, 1.5, 0.3))
	_add_box(Vector3(-4, 0.75, -4), Vector3(0.3, 1.5, 2.0))
	_add_box(Vector3( 5, 0.75,  3), Vector3(0.3, 1.5, 2.0))
	_add_box(Vector3( 0, 0.75,  5), Vector3(2.0, 1.5, 0.3))

	# 조명
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

	# 에코로케이션 노드 (카메라 자식 → 시점 따라감)
	_echo = Node3D.new()
	_echo.name = "Echolocation"
	_echo.set_script(load("res://scripts/echolocation.gd"))
	camera.add_child(_echo)

	# 오디오 피드백 노드
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

# ── 시그널 연결 ───────────────────────────────
func _wire_signals():
	# _echo, _audio, _heatmap 는 _ready 이후에 접근 가능
	call_deferred("_connect_after_ready")

func _connect_after_ready():
	_echo.depth_updated.connect(_audio.on_depth_updated)
	_echo.depth_updated.connect(_heatmap.on_depth_updated)

	# 파라미터 변경 → 오디오·에코·히트맵 동시 반영
	_settings.params_changed.connect(_audio.set_params)
	_settings.params_changed.connect(_echo.set_params)
	_settings.params_changed.connect(_heatmap.set_params)

	# 시작 시 기본값 적용
	var init_params := _settings.get_current_params()
	_audio.set_params(init_params)
	_echo.set_params(init_params)
	_heatmap.set_params(init_params)

func _input(event):
	if event.is_action_pressed("ui_cancel"):
		get_tree().quit()
