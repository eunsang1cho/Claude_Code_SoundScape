extends Node
# ─────────────────────────────────────────────
# audio_feedback.gd  — 3가지 실시간 전환 가능 에코로케이션 오디오 모드
#
# [1] 동시재생  : 전 열을 한 프레임에 합산, ITD+공기흡수+sqrt 압축
# [2] vOICe 스캔: L→R 순차 열 스캔, 열 위치 = 시간 → 뇌가 공간 디코딩
# [3] 거리→버즈 : 진폭 변조 속도가 거리를 인코딩 (가까울수록 빠른 진동)
#
# 연구 기반:
#   Woodworth (1954) ITD, Capelle (1998) PSVA sqrt압축
#   Meijer (1992) vOICe 순차스캔, Thaler (2011) 최적 에코 반복률
# ─────────────────────────────────────────────

## 오디오 모드
const MODE_SIMULTANEOUS := 0  ## [1] 동시재생 (기존 방식 + ITD)
const MODE_SEQUENTIAL   := 1  ## [2] vOICe 순차스캔 L→R
const MODE_AM_DISTANCE  := 2  ## [3] 거리 → 버즈 속도

var sound_mode: int = MODE_SIMULTANEOUS

const SAMPLE_RATE    := 44100.0
const BUF_LEN        := 0.15
## Thaler (2011): 2-4 Hz 최적 에코로케이션 핑 반복률 (기본값, 동적으로 변함)
const PULSE_FREQ     := 2.5
## Woodworth (1954) 구형 두부 모델
const HEAD_RADIUS_M  := 0.0875
const SPEED_OF_SOUND := 343.0
const ITD_BUF_SIZE   := 34
## PSVA (Capelle 1998): 4 Hz 스캔 = 0.25s 주기 (기본값, 동적으로 변함)
const SCAN_PERIOD    := 0.25

var min_freq   := 200.0
var max_freq   := 700.0
var near_dist  := 0.3
var max_dist   := 5.0
var smooth     := 0.35
var master_vol := 0.55

var _num_bands: int = 0
var _num_cols : int = 7
var _playback  : AudioStreamGeneratorPlayback
var _pulse_phase: float = 0.0

## Plan C: 거리→템포 동적 값 (on_depth_updated마다 갱신)
var _pulse_freq_dyn : float = 2.5   # Mode 1 펄스 Hz
var _scan_period_dyn: float = 0.25  # Mode 2 스캔 주기 초

## Plan D: 오디오용 고정 해상도 (히트맵은 21×15, 오디오는 7×5 유지)
const AUDIO_ROWS := 5
const AUDIO_COLS := 7

var _target_L := PackedFloat64Array()
var _target_R := PackedFloat64Array()
var _smooth_L := PackedFloat64Array()
var _smooth_R := PackedFloat64Array()
var _phases   := PackedFloat64Array()

## ITD 링버퍼 (Woodworth 1954)
var _itd_buf_L := PackedFloat64Array()
var _itd_buf_R := PackedFloat64Array()
var _itd_write : int   = 0
var _itd_delay : float = 0.0  # 양수=왼쪽 지연(소리 우측), 음수=오른쪽 지연

## [2] 순차스캔 상태
var _scan_col  : int   = 0
var _scan_timer: float = 0.0
var _col_amp   : Array = []   # [col][band]: PackedFloat64Array

## [3] AM 거리 인코딩
var _am_phases := PackedFloat64Array()
var _am_rates  := PackedFloat64Array()  # Hz per band (가까울수록 ↑)

# ─────────────────────────────────────────────
func _ready():
	var player := AudioStreamPlayer.new()
	var stream  := AudioStreamGenerator.new()
	stream.mix_rate      = SAMPLE_RATE
	stream.buffer_length = BUF_LEN
	player.stream    = stream
	player.volume_db = 0.0
	add_child(player)
	player.play()
	_playback = player.get_stream_playback()

	_itd_buf_L.resize(ITD_BUF_SIZE)
	_itd_buf_R.resize(ITD_BUF_SIZE)
	for i in range(ITD_BUF_SIZE):
		_itd_buf_L[i] = 0.0
		_itd_buf_R[i] = 0.0

## 1/2/3 키로 호출 — main.gd에서 연결
func set_sound_mode(mode: int) -> void:
	sound_mode   = mode
	_scan_col    = 0
	_scan_timer  = 0.0
	_pulse_phase = 0.0

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
	_am_phases.resize(num_bands)
	_am_rates.resize(num_bands)
	for i in range(num_bands):
		_target_L[i] = 0.0;  _target_R[i] = 0.0
		_smooth_L[i] = 0.0;  _smooth_R[i] = 0.0
		_phases[i]   = 0.0
		_am_phases[i] = 0.0; _am_rates[i] = 1.0

func _init_col_amp(cols: int) -> void:
	_col_amp.clear()
	_num_cols = cols
	for _c in range(cols):
		var arr := PackedFloat64Array()
		arr.resize(max(_num_bands, 1))
		for i in range(arr.size()): arr[i] = 0.0
		_col_amp.append(arr)

func _get_freq(band_idx: int) -> float:
	## 로그 주파수 스케일 — vOICe/PSVA 방식
	var t := float(band_idx) / float(max(_num_bands - 1, 1))
	return exp(lerp(log(min_freq), log(max_freq), t))

# ─────────────────────────────────────────────
func on_depth_updated(grid: Array) -> void:
	if grid.is_empty() or grid[0].is_empty():
		return

	# Plan D: 히트맵용 고해상도 그리드(21×15)를 오디오용 7×5로 다운샘플
	# 각 블록에서 "평지와 가장 다른" 셀을 선택 (가장 큰 |d - max_dist|)
	var raw_rows : int = grid.size()
	var raw_cols : int = grid[0].size()
	var row_scale: int = max(raw_rows / AUDIO_ROWS, 1)
	var col_scale: int = max(raw_cols / AUDIO_COLS, 1)
	var audio_grid: Array = []
	for ar in range(AUDIO_ROWS):
		var row_s := []
		for ac in range(AUDIO_COLS):
			var best_d   : float = max_dist
			var best_diff: float = 0.0
			for dr in range(row_scale):
				for dc in range(col_scale):
					var rr: int = ar * row_scale + dr
					var cc: int = ac * col_scale + dc
					if rr < raw_rows and cc < raw_cols:
						var dv  : float = grid[rr][cc]
						var diff: float = abs(dv - max_dist)
						if diff > best_diff:
							best_diff = diff
							best_d    = dv
			row_s.append(best_d)
		audio_grid.append(row_s)

	var rows: int = audio_grid.size()   # = AUDIO_ROWS = 5
	var cols: int = audio_grid[0].size() # = AUDIO_COLS = 7

	if _num_bands != rows:
		_init_bands(rows)
		_init_col_amp(cols)
	elif _col_amp.size() != cols:
		_init_col_amp(cols)

	# 타겟 초기화
	for b in range(_num_bands):
		_target_L[b] = 0.0
		_target_R[b] = 0.0
	for c in range(cols):
		var col_arr: PackedFloat64Array = _col_amp[c]
		for b in range(col_arr.size()):
			col_arr[b] = 0.0

	var total_w    : float = 0.0
	var weighted_az: float = 0.0

	for r in range(rows):
		var band_idx: int = rows - 1 - r   # 행 0=상단=고음 밴드

		for c in range(cols):
			var d: float = audio_grid[r][c]
			if d >= max_dist:
				continue   # 평지(max_dist) → 묵음

			var is_pit: bool  = (d < 0.0)
			var d_abs : float = abs(d)
			var vol   : float

			if is_pit:
				vol = 0.55   # 구멍: 고정 음량
			else:
				var t_dist   : float = clamp((d_abs - near_dist) / (max_dist - near_dist), 0.0, 1.0)
				# PSVA sqrt 진폭 압축 (Capelle 1998)
				vol = sqrt(max(0.0, 1.0 - t_dist))
				# ISO 9613-1 대기 흡수: 고주파 밴드가 거리와 함께 더 감쇠
				var freq_norm: float = float(band_idx) / float(max(_num_bands - 1, 1))
				var air_abs  : float = exp(-0.6 * freq_norm * t_dist)
				vol *= air_abs

			# Constant Power 패닝
			var pan    : float = lerp(-1.0, 1.0, float(c) / float(cols - 1))
			var pan_rad: float = (pan + 1.0) * 0.5 * PI / 2.0
			_target_L[band_idx] += vol * cos(pan_rad)
			_target_R[band_idx] += vol * sin(pan_rad)

			# [2] 순차스캔용 열별 진폭 저장
			var col_arr: PackedFloat64Array = _col_amp[c]
			col_arr[band_idx] += vol

			# Woodworth ITD 가중합: 1/d² (가까운 물체가 방위각 지배)
			var itd_w: float = 1.0 / max(d_abs * d_abs, 0.01)
			weighted_az += pan * 90.0 * itd_w
			total_w     += itd_w

	# 정규화
	for b in range(_num_bands):
		_target_L[b] /= cols
		_target_R[b] /= cols
	for c in range(cols):
		var col_arr: PackedFloat64Array = _col_amp[c]
		for b in range(col_arr.size()):
			col_arr[b] /= rows

	# Woodworth (1954) ITD: 지배적 방위각 계산
	if total_w > 0.0:
		var az_deg : float = clamp(weighted_az / total_w, -90.0, 90.0)
		var theta  : float = deg_to_rad(az_deg)
		var itd_sec: float = (HEAD_RADIUS_M / SPEED_OF_SOUND) * (theta + sin(theta))
		_itd_delay = itd_sec * SAMPLE_RATE

	# [3] AM 속도 계산: 밴드별 평균 거리 → 버즈 Hz
	for b in range(_num_bands):
		var r_idx: int = rows - 1 - b
		if r_idx < 0 or r_idx >= rows:
			continue
		var sum_d: float = 0.0
		var n    : int   = 0
		for c in range(cols):
			var dv: float = audio_grid[r_idx][c]
			if dv < max_dist:
				sum_d += abs(dv)
				n     += 1
		var dom_d: float = max_dist if n == 0 else sum_d / float(n)
		var t_d  : float = clamp((dom_d - near_dist) / (max_dist - near_dist), 0.0, 1.0)
		# 가까울수록 빠른 버즈: near=15Hz (강렬한 진동), far=0.5Hz (느린 맥박)
		_am_rates[b] = lerp(15.0, 0.5, t_d)

	# Luce & Clark (1965): 빠른 어택 / 느린 릴리즈
	for b in range(_num_bands):
		var dl: float = _target_L[b] - _smooth_L[b]
		_smooth_L[b] += (smooth * 2.2 if dl > 0.0 else smooth) * dl
		var dr: float = _target_R[b] - _smooth_R[b]
		_smooth_R[b] += (smooth * 2.2 if dr > 0.0 else smooth) * dr

	# Plan C: 가장 가까운 돌출 셀 거리 → 동적 템포 계산
	var d_min: float = max_dist
	for r in range(rows):
		for c in range(cols):
			var dv: float = audio_grid[r][c]
			if dv >= 0.0 and dv < max_dist:
				d_min = min(d_min, dv)
	var t_min: float = clamp((d_min - near_dist) / (max_dist - near_dist), 0.0, 1.0)
	_pulse_freq_dyn  = lerp(8.0, 0.8, t_min)   # 0.3m→8Hz, 5m→0.8Hz
	_scan_period_dyn = lerp(0.08, 0.5, t_min)  # 0.3m→0.08s, 5m→0.5s

# ─────────────────────────────────────────────
func _process(_delta: float):
	if _playback == null or _num_bands == 0:
		return

	var amp_scale: float = 0.28 * master_vol / _num_bands
	var frames   : int   = _playback.get_frames_available()

	for _j in range(frames):
		var left     : float = 0.0
		var right    : float = 0.0
		var apply_itd: bool  = true

		# ── [1] 동시재생 모드 ────────────────────────────────────
		if sound_mode == MODE_SIMULTANEOUS:
			_pulse_phase += _pulse_freq_dyn / SAMPLE_RATE
			if _pulse_phase >= 1.0: _pulse_phase -= 1.0
			var pulse: float = 0.0
			if _pulse_phase < 0.5:
				pulse = sin(_pulse_phase * TAU)   # 반사인 벨, 클릭 없음

			for b in range(_num_bands):
				var s: float = sin(_phases[b] * TAU) * amp_scale * pulse
				left  += s * _smooth_L[b]
				right += s * _smooth_R[b]
				_phases[b] += _get_freq(b) / SAMPLE_RATE
				if _phases[b] >= 1.0: _phases[b] -= 1.0

		# ── [2] vOICe 순차스캔 모드 ──────────────────────────────
		elif sound_mode == MODE_SEQUENTIAL:
			apply_itd = false   # 스캔 위치 자체가 스테레오 단서

			# 열 전진 (동적 스캔 주기 사용)
			var col_dur: float = _scan_period_dyn / float(max(_num_cols, 1))
			_scan_timer += 1.0 / SAMPLE_RATE
			if _scan_timer >= col_dur:
				_scan_timer -= col_dur
				_scan_col = (_scan_col + 1) % max(_num_cols, 1)

			# Hanning 창: 열 경계에서 클릭 방지 (0→1→0)
			var t_col  : float = _scan_timer / max(col_dur, 0.00001)
			var col_env: float = sin(t_col * PI)

			# 현재 열 위치 = 스테레오 패닝
			var scan_pan: float = lerp(-1.0, 1.0, float(_scan_col) / float(max(_num_cols - 1, 1)))
			var pan_rad : float = (scan_pan + 1.0) * 0.5 * PI / 2.0
			var gl      : float = cos(pan_rad)
			var gr      : float = sin(pan_rad)

			for b in range(_num_bands):
				var col_a: float = 0.0
				if _scan_col < _col_amp.size():
					var col_arr: PackedFloat64Array = _col_amp[_scan_col]
					if b < col_arr.size():
						col_a = col_arr[b]
				var s: float = sin(_phases[b] * TAU) * amp_scale * col_a * col_env
				left  += s * gl
				right += s * gr
				_phases[b] += _get_freq(b) / SAMPLE_RATE
				if _phases[b] >= 1.0: _phases[b] -= 1.0

		# ── [3] 거리→버즈 속도 모드 ──────────────────────────────
		elif sound_mode == MODE_AM_DISTANCE:
			for b in range(_num_bands):
				# 진폭 변조 위상 전진 (거리에 따라 다른 속도)
				var am_rate: float = 1.0
				if b < _am_rates.size(): am_rate = _am_rates[b]
				_am_phases[b] += am_rate / SAMPLE_RATE
				if _am_phases[b] >= 1.0: _am_phases[b] -= 1.0
				# 반파정류 사인 → 깔끔한 버즈 (0~1, 음수 없음)
				var am: float = max(0.0, sin(_am_phases[b] * TAU))
				var s : float = sin(_phases[b] * TAU) * amp_scale * am
				left  += s * _smooth_L[b]
				right += s * _smooth_R[b]
				_phases[b] += _get_freq(b) / SAMPLE_RATE
				if _phases[b] >= 1.0: _phases[b] -= 1.0

		# ── Woodworth ITD 링버퍼 ([1][3]에 적용, [2]는 스캔이 담당) ──
		_itd_buf_L[_itd_write] = left
		_itd_buf_R[_itd_write] = right

		var out_l: float
		var out_r: float

		if apply_itd:
			var delay_abs: float = abs(_itd_delay)
			var di: int   = int(delay_abs)
			var df: float = delay_abs - float(di)
			var p1: int
			var p0: int
			if _itd_delay >= 0.0:   # 소리 우측 → 왼쪽 지연
				out_r = right
				p1 = (_itd_write - di     + ITD_BUF_SIZE) % ITD_BUF_SIZE
				p0 = (_itd_write - di - 1 + ITD_BUF_SIZE) % ITD_BUF_SIZE
				out_l = lerp(_itd_buf_L[p1], _itd_buf_L[p0], df)
			else:                   # 소리 좌측 → 오른쪽 지연
				out_l = left
				p1 = (_itd_write - di     + ITD_BUF_SIZE) % ITD_BUF_SIZE
				p0 = (_itd_write - di - 1 + ITD_BUF_SIZE) % ITD_BUF_SIZE
				out_r = lerp(_itd_buf_R[p1], _itd_buf_R[p0], df)
		else:
			out_l = left
			out_r = right

		_itd_write = (_itd_write + 1) % ITD_BUF_SIZE

		_playback.push_frame(Vector2(
			clamp(out_l, -1.0, 1.0),
			clamp(out_r, -1.0, 1.0)
		))
