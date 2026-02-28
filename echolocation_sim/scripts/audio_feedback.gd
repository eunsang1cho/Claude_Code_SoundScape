extends Node
# ─────────────────────────────────────────────
# audio_feedback.gd
# 깊이 그리드 → 3-존 스테레오 사인파 생성
#
#  좌 영역(0~2열) : 300 Hz 기준, 좌 패닝
#  중앙(3열)      : 600 Hz 기준, 중앙
#  우 영역(4~6열) : 1000 Hz 기준, 우 패닝
#
# 거리가 가까울수록 → 고음 + 큰 소리
# 거리가 멀수록    → 저음 + 작은 소리
# ─────────────────────────────────────────────

const SAMPLE_RATE  := 44100.0
const BUF_LEN      := 0.15       # 초 단위 버퍼

const MAX_DIST     := 5.0

## [기준 Hz, 최대 Hz]  –  거리 가까울수록 max 쪽으로
const ZONE_FREQ := [
	[250.0,  800.0],   # 왼쪽
	[500.0, 1200.0],   # 중앙
	[350.0,  900.0],   # 오른쪽
]
## [left_amp, right_amp] 스테레오 패닝
const ZONE_PAN := [
	[1.0, 0.15],   # 왼쪽
	[0.7, 0.7 ],   # 중앙
	[0.15, 1.0],   # 오른쪽
]

var _playbacks := []   # AudioStreamGeneratorPlayback × 3
var _phases    := [0.0, 0.0, 0.0]
var _freqs     := [0.0, 0.0, 0.0]
var _amps      := [0.0, 0.0, 0.0]   # 0.0 ~ 0.35

func _ready():
	for i in range(3):
		var player := AudioStreamPlayer.new()
		var stream := AudioStreamGenerator.new()
		stream.mix_rate = SAMPLE_RATE
		stream.buffer_length = BUF_LEN
		player.stream = stream
		player.volume_db = 0.0
		add_child(player)
		player.play()
		_playbacks.append(player.get_stream_playback())

# 에코로케이션 시그널에 연결
func on_depth_updated(grid: Array) -> void:
	var cols: int = grid[0].size()

	# 존별 최소 거리
	var zone_min := [MAX_DIST, MAX_DIST, MAX_DIST]
	for row in grid:
		for c in range(row.size()):
			var zone: int
			if c <= 1:
				zone = 0
			elif c >= cols - 2:
				zone = 2
			else:
				zone = 1
			zone_min[zone] = min(zone_min[zone], row[c])

	# 거리 → 주파수 / 진폭 업데이트
	for i in range(3):
		var t := 1.0 - clamp(zone_min[i] / MAX_DIST, 0.0, 1.0)
		# 가까울수록 t → 1
		_freqs[i] = lerp(ZONE_FREQ[i][0], ZONE_FREQ[i][1], t * t)
		_amps[i]  = lerp(0.0, 0.30, t)

func _process(_delta: float):
	for i in range(3):
		var pb: AudioStreamGeneratorPlayback = _playbacks[i]
		if pb == null:
			continue
		var frames: int = pb.get_frames_available()
		var freq   := _freqs[i]
		var amp    := _amps[i]
		var pan_l  := ZONE_PAN[i][0]
		var pan_r  := ZONE_PAN[i][1]

		for _j in range(frames):
			var s: float = sin(_phases[i] * TAU) * amp
			pb.push_frame(Vector2(s * pan_l, s * pan_r))
			_phases[i] += freq / SAMPLE_RATE
			if _phases[i] >= 1.0:
				_phases[i] -= 1.0
