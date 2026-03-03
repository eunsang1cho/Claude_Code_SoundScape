package com.soundscape.entity;

import org.bukkit.Location;

/**
 * EntityHit - FOV 내에서 감지된 엔티티 한 건의 정보
 *
 * SpatialAudioEngine.playEntities()가 소리 재생에 필요한 최소한의 데이터만 담음.
 */
public class EntityHit {

    /** 엔티티 중심 월드 좌표 (사운드 재생 위치로 사용) */
    public final Location position;

    /** 플레이어 눈 기준 거리 (블록) */
    public final double dist;

    /** 엔티티 분류 (소리·피치 결정) */
    public final EntityCategory category;

    public EntityHit(Location position, double dist, EntityCategory category) {
        this.position = position;
        this.dist = dist;
        this.category = category;
    }
}
