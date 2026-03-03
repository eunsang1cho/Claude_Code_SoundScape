package com.soundscape.audio;

/**
 * ScanType - 공간 청각화 모드 정의
 *
 * /ss type1 ~ /ss type3 으로 전환 가능.
 *
 * ┌────────┬──────────────┬─────────────────────────────────────────────────┐
 * │ 명령어  │ 모드          │ 동작 원리                                        │
 * ├────────┼──────────────┼─────────────────────────────────────────────────┤
 * │ type1  │ FULL         │ 7×5 전체 그리드. 감지된 모든 셀 위치에서 소리.      │
 * │        │              │ 가장 상세한 공간 인식. Godot 시뮬레이터 기본 방식.   │
 * ├────────┼──────────────┼─────────────────────────────────────────────────┤
 * │ type2  │ COLUMN       │ 7개 수평 방향 열마다 가장 가까운 블록 1개만 소리.    │
 * │        │              │ 수평 장애물 위치 파악 특화. The vOICe 스윕 방식.     │
 * ├────────┼──────────────┼─────────────────────────────────────────────────┤
 * │ type3  │ NEAREST      │ 전체 그리드에서 가장 가까운 블록 1개만 소리.         │
 * │        │              │ 가장 단순. 즉각적인 전방 위험 감지에 최적.           │
 * └────────┴──────────────┴─────────────────────────────────────────────────┘
 */
public enum ScanType {

    FULL(1,
            "전체 그리드",
            "7×5 격자 전체 스캔 — 가장 상세한 공간 인식"),

    COLUMN(2,
            "열 스윕",
            "7방향 열별 최근접 블록 — 수평 장애물 탐지 특화"),

    NEAREST(3,
            "최근접 단일",
            "가장 가까운 블록 하나만 — 즉각적 위험 감지");

    public final int id;
    public final String displayName;
    public final String description;

    ScanType(int id, String displayName, String description) {
        this.id = id;
        this.displayName = displayName;
        this.description = description;
    }

    /** id(1~3)로 ScanType 조회. 범위 밖이면 FULL 반환. */
    public static ScanType fromId(int id) {
        for (ScanType t : values()) {
            if (t.id == id) return t;
        }
        return FULL;
    }
}
