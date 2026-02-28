extends Node
# ─────────────────────────────────────────────
# audio_feedback.gd
# 히트맵 기반 3D 스테레오 사운드
#
# 전체 깊이 그리드를 한 프레임에 동시 처리:
#   X축 (열 위치)  : 왼쪽 열 → 좌 채널, 오른쪽 열 → 우 채널
#   Y축 (행 위치)  : 위쪽 행 → 고음, 아래쪽 행 → 저음
#   Z축 (깊이)     : 가까울수록 → 큰 소리
# ─────────────────────────────────────────────

const SAMPLE_RATE  := 44100.0
const BUF_LEN      := 0.15

const MAX_DIST     := 5.0
const NEAR_DIST    := 0.3    # 이 거리 이하 = 최대 볼륨
## 주파수 범위 (로그 스케일)
const MIN_FREQ     := 200.0  # 화면 하단 (저음)
const MAX_FREQ     := 1600.0 # 화면 상단 (고음)
## 지수 평활 계수 (5 FPS 업데이트 주기에 맞춤)
const SMOOTH_ALPHA := 0.35

# 밴드 수는 런타임에 결정 (GRID_ROWS와 동일)
var _num_bands: int = 0

var _playback: AudioStreamGeneratorPlayback

# 밴드별 L/R 독립 진폭
var _target_L := PackedFloat64Array()
var _target_R := PackedFloat64Array()
var _smooth_L := PackedFloat64Array()
var _smooth_R := PackedFloat64Array()
var _phases   := PackedFloat64Array()

func _ready():
	var player := AudioStreamPlayer.new()
	var stream := AudioStreamGenerator.new()
	stream.mix_rate = SAMPLE_RATE
	stream.buffer_length = BUF_LEN
	player.stream = stream
	player.volume_db = 0.0
	add_child(player)
	player.play()
	_playback = player.get_stream_playback()

func _init_bands(num_bands: int) -> void:
	_num_bands = num_bands
	_target_L.resize(num_bands)
	_target_R.resize(num_bands)
	_smooth_L.resize(num_bands)
	_smooth_R.resize(num_bands)
	_phases.resize(num_bands)
	for i in range(num_bands):
		_target_L[i] = 0.0
		_target_R[i] = 0.0
		_smooth_L[i] = 0.0
		_smooth_R[i] = 0.0
		_phases[i]   = 0.0

func _get_freq(band_idx: int) -> float:
	# band 0 = 하단(저음), band _num_bands-1 = 상단(고음)
	var t := float(band_idx) / float(max(_num_bands - 1, 1))
	return exp(lerp(log(MIN_FREQ), log(MAX_FREQ), t))

# 에코로케이션 시그널에 연결
func on_depth_updated(grid: Array) -> void:
	if grid.is_empty() or grid[0].is_empty():
		return

	var rows: int = grid.size()    # GRID_ROWS
	var cols: int = grid[0].size() # GRID_COLS

	# 첫 호출 시 밴드 수 초기화
	if _num_bands != rows:
		_init_bands(rows)

	# 타겟 초기화
	for b in range(_num_bands):
		_target_L[b] = 0.0
		_target_R[b] = 0.0

	# 히트맵 전체 처리: 각 셀 → L/R 기여 합산
	for r in range(rows):
		# 행 0(위) = 고음 밴드, 행 rows-1(아래) = 저음 밴드
		var band_idx: int = rows - 1 - r

		for c in range(cols):
			var d: float = grid[r][c]
			if d >= MAX_DIST:
				continue

			# 거리 → 볼륨 (가까울수록 크게)
			var t_vol := 1.0 - clamp((d - NEAR_DIST) / (MAX_DIST - NEAR_DIST), 0.0, 1.0)
			var vol   := t_vol * t_vol * t_vol

			# 열 위치 → 패닝 (-1:좌 ~ +1:우)
			var pan     := lerp(-1.0, 1.0, float(c) / float(cols - 1))
			var pan_rad := (pan + 1.0) * 0.5 * PI / 2.0
			var gain_l  := cos(pan_rad)
			var gain_r  := sin(pan_rad)

			_target_L[band_idx] += vol * gain_l
			_target_R[band_idx] += vol * gain_r

	# 열 수로 정규화
	for b in range(_num_bands):
		_target_L[b] /= cols
		_target_R[b] /= cols

	# 지수 평활 (5 FPS 업데이트 시점에 적용)
	for b in range(_num_bands):
		_smooth_L[b] += SMOOTH_ALPHA * (_target_L[b] - _smooth_L[b])
		_smooth_R[b] += SMOOTH_ALPHA * (_target_R[b] - _smooth_R[b])

func _process(_delta: float):
	if _playback == null or _num_bands == 0:
		return

	var frames: int = _playback.get_frames_available()
	for _j in range(frames):
		var left  := 0.0
		var right := 0.0

		for b in range(_num_bands):
			var vol_l := _smooth_L[b]
			var vol_r := _smooth_R[b]

			var freq := _get_freq(b)
			var s    := sin(_phases[b] * TAU) * 0.28 / _num_bands

			left  += s * vol_l
			right += s * vol_r

			_phases[b] += freq / SAMPLE_RATE
			if _phases[b] >= 1.0:
				_phases[b] -= 1.0

		# 소프트 클리핑
		_playback.push_frame(Vector2(
			clamp(left,  -1.0, 1.0),
			clamp(right, -1.0, 1.0)
		))
