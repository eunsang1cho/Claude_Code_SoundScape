extends Control
# ─────────────────────────────────────────────
# settings_overlay.gd
# Tab 키로 토글되는 실시간 파라미터 조정 패널
#
# 기본값 근거:
#   - The vOICe (Meijer 1992): 500Hz~5kHz 사용,
#     단 장시간 사용 편의상 200~1600Hz 권장 (EyeMusic 참고)
#   - PSVA (Capelle 1998): 250~2000Hz 범위 사용
#   - 실내 내비게이션 연구: MAX_DIST 5m 충분
#   - 스무딩: 5 FPS 업데이트 기준 0.35 적정
# ─────────────────────────────────────────────

signal params_changed(params: Dictionary)

## 연구 기반 기본값
const DEFAULTS := {
	"min_freq":    200.0,   # Hz  — 귀에 안전한 최저역 (PSVA: 250Hz)
	"max_freq":    700.0,   # Hz  — 장시간 청취 피로 최소화 (고주파 감소)
	"near_dist":    0.3,    # m   — 이 거리 이하 = 최대 볼륨 (보행 안전 기준)
	"max_dist":     5.0,    # m   — 이 거리 이상 = 무음 (실내 복도 기준)
	"smooth":       0.35,   # 0~1 — 5 FPS 갱신 주기 기준 부드러운 전환
	"volume":       0.55,   # 0~1 — 마스터 볼륨 (피로 감소)
	"update_fps":   5.0,    # FPS — 깊이 스캔 주기 (지연·음질 균형점)
}

## [key, 표시 이름, min, max, step]
const PARAM_DEFS := [
	["min_freq",   "최소 주파수 (Hz)",      80.0,  800.0,  10.0],
	["max_freq",   "최대 주파수 (Hz)",     400.0, 4000.0,  50.0],
	["near_dist",  "근거리 임계 (m)",        0.1,    2.0,  0.05],
	["max_dist",   "최대 감지 거리 (m)",     1.0,   15.0,   0.5],
	["smooth",     "스무딩",               0.05,    1.0,  0.05],
	["volume",     "마스터 볼륨",            0.0,    1.0,  0.05],
	["update_fps", "업데이트 FPS",           1.0,   20.0,   1.0],
]

var _sliders    := {}
var _val_labels := {}

func _ready():
	_build_ui()
	visible = false

func _build_ui() -> void:
	var panel := PanelContainer.new()
	panel.position = Vector2(20, 20)
	add_child(panel)

	var vbox := VBoxContainer.new()
	vbox.custom_minimum_size = Vector2(370, 0)
	vbox.add_theme_constant_override("separation", 7)
	panel.add_child(vbox)

	# 제목
	var title := Label.new()
	title.text = "파라미터 설정  [Tab: 닫기]"
	title.add_theme_color_override("font_color", Color(1.0, 0.9, 0.2))
	vbox.add_child(title)
	vbox.add_child(HSeparator.new())

	for p in PARAM_DEFS:
		var key    : String = p[0]
		var lbl_tx : String = p[1]
		var p_min  : float  = p[2]
		var p_max  : float  = p[3]
		var step   : float  = p[4]

		var row := HBoxContainer.new()
		vbox.add_child(row)

		var name_lbl := Label.new()
		name_lbl.text = lbl_tx
		name_lbl.custom_minimum_size = Vector2(170, 0)
		row.add_child(name_lbl)

		var slider := HSlider.new()
		slider.min_value  = p_min
		slider.max_value  = p_max
		slider.step       = step
		slider.value      = DEFAULTS[key]
		slider.custom_minimum_size        = Vector2(120, 20)
		slider.size_flags_horizontal      = Control.SIZE_EXPAND_FILL
		row.add_child(slider)

		var val_lbl := Label.new()
		val_lbl.text = _fmt(key, DEFAULTS[key])
		val_lbl.custom_minimum_size = Vector2(70, 0)
		row.add_child(val_lbl)

		_sliders[key]    = slider
		_val_labels[key] = val_lbl

		slider.value_changed.connect(_on_changed.bind(key))

	vbox.add_child(HSeparator.new())

	var hint := Label.new()
	hint.text = "* 변경 즉시 반영  |  H: 히트맵 토글"
	hint.add_theme_color_override("font_color", Color(0.65, 0.65, 0.65))
	vbox.add_child(hint)

func _on_changed(value: float, key: String) -> void:
	_val_labels[key].text = _fmt(key, value)
	_emit()

func _emit() -> void:
	var params := {}
	for k in _sliders:
		params[k] = _sliders[k].value
	emit_signal("params_changed", params)

func get_current_params() -> Dictionary:
	var params := {}
	for k in _sliders:
		params[k] = _sliders[k].value
	return params

func _fmt(key: String, v: float) -> String:
	match key:
		"min_freq", "max_freq": return "%.0f Hz" % v
		"near_dist", "max_dist": return "%.2f m" % v
		"update_fps": return "%.0f fps" % v
		_: return "%.2f" % v

func _input(event: InputEvent):
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_TAB:
			visible = !visible
			if visible:
				_emit()
			get_viewport().set_input_as_handled()
