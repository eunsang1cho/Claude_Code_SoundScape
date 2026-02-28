extends Node
# ─────────────────────────────────────────────
# audio_feedback.gd
# 히트맵 기반 3D 스테레오 사운드
#
#   X축 (열 위치)  : 왼쪽 열 → 좌 채널, 오른쪽 열 → 우 채널
#   Y축 (행 위치)  : 위쪽 행 → 고음, 아래쪽 행 → 저음
#   Z축 (깊이)     : 가까울수록 → 큰 소리
#
# set_params(params) 로 실시간 파라미터 조정 가능
# ─────────────────────────────────────────────

const SAMPLE_RATE  := 44100.0
const BUF_LEN      := 0.15

## 실시간 조정 가능한 파라미터 (settings_overlay 기본값과 동기화)
var min_freq    := 200.0
var max_freq    := 1600.0
var near_dist   := 0.3
var max_dist    := 5.0
var smooth      := 0.35
var master_vol  := 0.80

# 밴드 수는 런타임에 결정 (GRID_ROWS와 동일)
var _num_bands: int = 0

var _playback: AudioStreamGeneratorPlayback

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

## settings_overlay에서 호출 — 즉시 반영
func set_params(params: Dictionary) -> void:
	if params.has("min_freq"):   min_freq   = params["min_freq"]
	if params.has("max_freq"):   max_freq   = params["max_freq"]
	if params.has("near_dist"):  near_dist  = params["near_dist"]
	if params.has("max_dist"):   max_dist   = params["max_dist"]
	if params.has("smooth"):     smooth     = params["smooth"]
	if params.has("volume"):     master_vol = params["volume"]

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
	return exp(lerp(log(min_freq), log(max_freq), t))

# 에코로케이션 시그널에 연결
func on_depth_updated(grid: Array) -> void:
	if grid.is_empty() or grid[0].is_empty():
		return

	var rows: int = grid.size()
	var cols: int = grid[0].size()

	if _num_bands != rows:
		_init_bands(rows)

	for b in range(_num_bands):
		_target_L[b] = 0.0
		_target_R[b] = 0.0

	for r in range(rows):
		var band_idx: int = rows - 1 - r

		for c in range(cols):
			var d: float = grid[r][c]
			if d >= max_dist:
				continue

			var t_vol := 1.0 - clamp((d - near_dist) / (max_dist - near_dist), 0.0, 1.0)
			var vol   := t_vol * t_vol * t_vol

			var pan     := lerp(-1.0, 1.0, float(c) / float(cols - 1))
			var pan_rad := (pan + 1.0) * 0.5 * PI / 2.0
			var gain_l  := cos(pan_rad)
			var gain_r  := sin(pan_rad)

			_target_L[band_idx] += vol * gain_l
			_target_R[band_idx] += vol * gain_r

	for b in range(_num_bands):
		_target_L[b] /= cols
		_target_R[b] /= cols

	for b in range(_num_bands):
		_smooth_L[b] += smooth * (_target_L[b] - _smooth_L[b])
		_smooth_R[b] += smooth * (_target_R[b] - _smooth_R[b])

func _process(_delta: float):
	if _playback == null or _num_bands == 0:
		return

	var amp_scale := 0.28 * master_vol / _num_bands

	var frames: int = _playback.get_frames_available()
	for _j in range(frames):
		var left  := 0.0
		var right := 0.0

		for b in range(_num_bands):
			var s := sin(_phases[b] * TAU) * amp_scale
			left  += s * _smooth_L[b]
			right += s * _smooth_R[b]

			_phases[b] += _get_freq(b) / SAMPLE_RATE
			if _phases[b] >= 1.0:
				_phases[b] -= 1.0

		_playback.push_frame(Vector2(
			clamp(left,  -1.0, 1.0),
			clamp(right, -1.0, 1.0)
		))
