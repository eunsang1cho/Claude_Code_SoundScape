extends CharacterBody3D
# ─────────────────────────────────────────────
# player.gd  – 1인칭 FPS 이동 + 마우스 시점
# ─────────────────────────────────────────────

const SPEED          := 2.5    # m/s  (시각장애 보조 → 천천히)
const GRAVITY        := 9.8
const MOUSE_SENS     := 0.002

@onready var _camera: Camera3D = $Camera3D

func _ready():
	Input.set_mouse_mode(Input.MOUSE_MODE_CAPTURED)

func _input(event: InputEvent):
	if event is InputEventMouseMotion and \
	   Input.get_mouse_mode() == Input.MOUSE_MODE_CAPTURED:
		rotate_y(-event.relative.x * MOUSE_SENS)
		_camera.rotate_x(-event.relative.y * MOUSE_SENS)
		_camera.rotation.x = clamp(_camera.rotation.x, -PI / 2.2, PI / 2.2)

	# ESC → 마우스 해제 (main.gd 의 ui_cancel 로 종료)
	if event.is_action_pressed("ui_cancel"):
		if Input.get_mouse_mode() == Input.MOUSE_MODE_CAPTURED:
			Input.set_mouse_mode(Input.MOUSE_MODE_VISIBLE)

func _physics_process(delta: float):
	# 중력
	if not is_on_floor():
		velocity.y -= GRAVITY * delta

	# 이동 방향 (수평)
	var dir := Vector3.ZERO
	if Input.is_action_pressed("move_forward"):
		dir -= transform.basis.z
	if Input.is_action_pressed("move_back"):
		dir += transform.basis.z
	if Input.is_action_pressed("move_left"):
		dir -= transform.basis.x
	if Input.is_action_pressed("move_right"):
		dir += transform.basis.x

	dir = dir.normalized()
	velocity.x = dir.x * SPEED
	velocity.z = dir.z * SPEED

	move_and_slide()
