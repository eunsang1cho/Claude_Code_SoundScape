extends Node
# ─────────────────────────────────────────────
# audio_feedback.gd  — 4가지 실시간 전환 가능 에코로케이션 오디오 모드
#
# [1] 동시재생  : 전 열을 한 프레임에 합산, ITD+공기흡수+sqrt 압축
# [2] vOICe 스캔: L→R 순차 열 스캔, 열 위치 = 시간 → 뇌가 공간 디코딩
# [3] 거리→버즈 : 진폭 변조 속도가 거리를 인코딩 (가까울수록 빠른 진동)
# [4] 그레인 배음: 거리→음색(배음 풍부도), 밝기→트레몰로, 중심와 Gaussian 가중치
#
# 연구 기반:
#   Woodworth (1954) ITD, Capelle (1998) PSVA sqrt압축
#   Meijer (1992) vOICe 순차스캔, Thaler (2011) 최적 에코 반복률
#   Roads (2001) Granular Synthesis, Blauert (1997) 청각 공간화
# ─────────────────────────────────────────────

## 오디오 모드
const MODE_SIMULTANEOUS := 0  ## [1] 동시재생 (기존 방식 + ITD)
const MODE_SEQUENTIAL   := 1  ## [2] vOICe 순차스캔 L→R
const MODE_AM_DISTANCE  := 2  ## [3] 거리 → 버즈 속도
const MODE_GRANULAR     := 3  ## [4] 그레인 배음 질감 합성

## 중심와 효과: 정면 ±34° ≈ ±2열, σ=1.5열 Gaussian
const FOVEA_SIGMA := 1.5

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

## [4] 그레인 배음 질감 합성
var _harmonic_richness := PackedFloat64Array()  # 0=순수사인, 1=배음풍부 (거리 역수)
var _tremolo_phases    := PackedFloat64Array()  # 밴드별 트레몰로 위상
var _tremolo_rates     := PackedFloat64Array()  # 밴드별 트레몰로 Hz (salience → 0.5~8Hz)
var _grain_phases_4    := PackedFloat64Array()  # 밴드별 그레인 엔벨로프 위상
var _grain_durations   := PackedFloat64Array()  # 밴드별 그레인 길이(초): 가까울수록 짧음
var _focus_boost       : float = 1.0            # 정면 중앙 장애물 감지 시 배음 부스트

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
	_harmonic_richness.resize(num_bands)
	_tremolo_phases.resize(num_bands)
	_tremolo_rates.resize(num_bands)
	_grain_phases_4.resize(num_bands)
	_grain_durations.resize(num_bands)
	for i in range(num_bands):
		_target_L[i] = 0.0;  _target_R[i] = 0.0
		_smooth_L[i] = 0.0;  _smooth_R[i] = 0.0
		_phases[i]   = 0.0
		_am_phases[i] = 0.0; _am_rates[i] = 1.0
		_harmonic_richness[i] = 0.0
		_tremolo_phases[i]    = float(i) / float(max(num_bands, 1))  # 위상 분산
		_tremolo_rates[i]     = 1.0
		_grain_phases_4[i]    = float(i) / float(max(num_bands, 1))  # 밴드마다 위상 오프셋
		_grain_durations[i]   = 0.04

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

	# ── [4] 그레인 배음 질감 합성 데이터 계산 ────────────────────────
	# 중심와 Gaussian: 정면 ±2열(≈±34°)이 배음 계산에 지배적으로 기여
	var center_col: float = float(cols - 1) / 2.0
	# 동적 포커스 스파이크: 중앙 열(2,3,4)에 가까운 장애물이 있으면 부스트
	var focus_sum  : float = 0.0
	var focus_count: int   = 0
	for fc in range(max(0, int(center_col) - 1), min(cols, int(center_col) + 2)):
		for fr in range(rows):
			var fd: float = audio_grid[fr][fc]
			if fd >= 0.0 and fd < 2.0:   # 2m 이내 = 포커스 위험 영역
				focus_sum += 1.0 - clamp((fd - near_dist) / (2.0 - near_dist), 0.0, 1.0)
				focus_count += 1
	# 포커스 부스트: 최대 2.5배 배음 강화 (중앙 장애물 "번쩍" 경고)
	_focus_boost = lerp(1.0, 2.5, clamp(focus_sum / max(float(focus_count), 1.0), 0.0, 1.0)) if focus_count > 0 else 1.0

	for b in range(_num_bands):
		var r_idx: int = rows - 1 - b
		if r_idx < 0 or r_idx >= rows:
			continue
		var sum_rich : float = 0.0
		var sum_w    : float = 0.0
		for c in range(cols):
			# 중심와 Gaussian 가중치 (Roads 2001: 공간 밀도 차별화)
			var fovea_w: float = exp(-0.5 * pow((c - center_col) / FOVEA_SIGMA, 2.0))
			var dv: float = audio_grid[r_idx][c]
			if dv < max_dist:
				var d_abs : float = abs(dv)
				var t_d   : float = clamp((d_abs - near_dist) / (max_dist - near_dist), 0.0, 1.0)
				# 배음 풍부도: 가까울수록 1(날카로운 배음), 멀수록 0(순수 사인)
				sum_rich += (1.0 - t_d) * fovea_w
				sum_w    += fovea_w
		var richness: float = sum_rich / max(sum_w, 0.001)
		_harmonic_richness[b] = clamp(richness * _focus_boost, 0.0, 1.0)

		# 트레몰로 속도: salience 높을수록 빠른 떨림 → 뇌의 주의 유도
		_tremolo_rates[b] = lerp(0.5, 8.0, _harmonic_richness[b])

		# 그레인 길이: 가까울수록 짧고 빽빽한 질감 (15ms~60ms)
		# 가장 가까운 fovea 가중 거리를 그레인 밀도에 반영
		var avg_d: float = (max_dist - sum_rich / max(sum_w, 0.001) * (max_dist - near_dist)) if sum_w > 0.0 else max_dist
		var t_grain: float = clamp((avg_d - near_dist) / (max_dist - near_dist), 0.0, 1.0)
		_grain_durations[b] = lerp(0.015, 0.06, t_grain)

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

		# ── [4] 그레인 배음 질감 합성 모드 ──────────────────────────
		elif sound_mode == MODE_GRANULAR:
			for b in range(_num_bands):
				# 밴드별 그레인 엔벨로프 (Hanning 창: 0→1→0)
				# 그레인 길이가 짧을수록 입자가 빽빽해짐 = 가까운 물체의 질감
				_grain_phases_4[b] += 1.0 / (SAMPLE_RATE * max(_grain_durations[b], 0.001))
				if _grain_phases_4[b] >= 1.0: _grain_phases_4[b] -= 1.0
				var grain_env: float = sin(_grain_phases_4[b] * PI)

				# 트레몰로: 중요한 물체일수록 빠른 떨림으로 뇌의 주의 유도
				_tremolo_phases[b] += _tremolo_rates[b] / SAMPLE_RATE
				if _tremolo_phases[b] >= 1.0: _tremolo_phases[b] -= 1.0
				var tremolo: float = (1.0 + sin(_tremolo_phases[b] * TAU)) * 0.5

				# 배음 합성: f + r*(2f*0.5 + 3f*0.33 + 4f*0.25 + 5f*0.20)
				# 가까울수록 r→1: 밝고 날카로운 소리 (시각 히트맵 '빨강' 대응)
				# 멀수록 r→0: 순수 사인 (시각 히트맵 '파랑' 대응)
				var r: float = _harmonic_richness[b]
				var s: float = sin(_phases[b] * TAU)
				if r > 0.02:
					s += r * (
						sin(2.0 * _phases[b] * TAU) * 0.500 +
						sin(3.0 * _phases[b] * TAU) * 0.333 +
						sin(4.0 * _phases[b] * TAU) * 0.250 +
						sin(5.0 * _phases[b] * TAU) * 0.200
					)
					# 정규화: 클리핑 방지 (배음 합산 최대 ≈ 2.283)
					s /= (1.0 + r * (0.500 + 0.333 + 0.250 + 0.200))

				s *= amp_scale * grain_env * tremolo
				left  += s * _smooth_L[b]
				right += s * _smooth_R[b]

				_phases[b] += _get_freq(b) / SAMPLE_RATE
				if _phases[b] >= 1.0: _phases[b] -= 1.0

		# ── Woodworth ITD 링버퍼 ([1][3][4]에 적용, [2]는 스캔이 담당) ──
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
