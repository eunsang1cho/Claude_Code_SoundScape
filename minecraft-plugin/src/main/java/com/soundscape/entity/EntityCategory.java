package com.soundscape.entity;

import org.bukkit.Sound;

/**
 * EntityCategory - 시야 내 엔티티의 청각 피드백 분류
 *
 * 각 카테고리는 특정 사운드와 피치를 가져 청각만으로 구별 가능:
 *
 * ┌──────────────┬──────────────────────────────┬────────┬──────────────────────────────────────┐
 * │ 카테고리      │ 해당 엔티티 예시             │  피치  │ 사운드                                │
 * ├──────────────┼──────────────────────────────┼────────┼──────────────────────────────────────┤
 * │ NPC          │ 주민, 행상인                  │  1.0   │ ENTITY_VILLAGER_AMBIENT  (흠흠 소리)  │
 * │ HOSTILE      │ 좀비, 스켈레톤, 크리퍼 등    │  0.8   │ ENTITY_ZOMBIE_AMBIENT    (으르렁)      │
 * │ PASSIVE      │ 소, 양, 돼지, 닭 등           │  1.2   │ ENTITY_COW_AMBIENT       (음메)        │
 * │ AGGRESSIVE   │ 늑대, 벌, 북극곰 등           │  0.75  │ ENTITY_WOLF_GROWL        (으르렁·경고) │
 * └──────────────┴──────────────────────────────┴────────┴──────────────────────────────────────┘
 */
public enum EntityCategory {

    /** 마을 주민·행상인 등 우호적 NPC */
    NPC(Sound.ENTITY_VILLAGER_AMBIENT, 1.0f,
            "NPC (주민·행상인)"),

    /** Monster 인터페이스 구현체 — 좀비, 스켈레톤, 크리퍼, 마녀 등 */
    HOSTILE(Sound.ENTITY_ZOMBIE_AMBIENT, 0.8f,
            "적 (몬스터)"),

    /** 비공격 동물 — 소, 양, 돼지, 닭, 말, 수중 생물 등 */
    PASSIVE(Sound.ENTITY_COW_AMBIENT, 1.2f,
            "동물(미공격)"),

    /** 자극 시 공격하는 중립 동물 — 늑대, 벌, 북극곰, 엔더맨 등 */
    AGGRESSIVE(Sound.ENTITY_WOLF_GROWL, 0.75f,
            "동물(선공형)");

    public final Sound sound;
    public final float pitch;
    public final String description;

    EntityCategory(Sound sound, float pitch, String description) {
        this.sound = sound;
        this.pitch = pitch;
        this.description = description;
    }
}
