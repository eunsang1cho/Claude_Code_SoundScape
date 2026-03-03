package com.soundscape.entity;

import com.soundscape.SoundScapePlugin;
import org.bukkit.Location;
import org.bukkit.entity.*;

import java.util.ArrayList;
import java.util.List;

/**
 * EntityScanner - 플레이어 FOV 내의 엔티티를 탐지·분류
 *
 * 블록 레이캐스트(BlockScanner)와 달리, 엔티티는 이미 월드 좌표가 있으므로
 * 플레이어 시선 기준 수평·수직 각도 오프셋을 계산해 FOV 범위 여부를 판단.
 *
 * FOV 범위는 BlockScanner와 동일한 값(fov.horizontal, fov.vertical)을 사용하여
 * 블록 그리드와 같은 "시야"를 공유함.
 *
 * 분류 우선순위 (위쪽이 높음):
 *   1. AbstractVillager (주민·행상인)  → NPC
 *   2. Monster 인터페이스              → HOSTILE
 *   3. Neutral 인터페이스              → AGGRESSIVE
 *   4. Animals / WaterMob / Ambient    → PASSIVE
 */
public class EntityScanner {

    private final SoundScapePlugin plugin;

    public EntityScanner(SoundScapePlugin plugin) {
        this.plugin = plugin;
    }

    /**
     * 플레이어 FOV 내의 엔티티를 스캔하여 목록 반환.
     *
     * @param player 스캔 기준 플레이어
     * @return FOV 내 감지된 엔티티 (위치·거리·카테고리)
     */
    public List<EntityHit> scan(Player player) {
        double maxDist = plugin.getConfig().getDouble("max_distance", 12.0);
        double fovH    = plugin.getConfig().getDouble("fov.horizontal", 60.0);
        double fovV    = plugin.getConfig().getDouble("fov.vertical", 40.0);

        // 수직 FOV 분할: 위로 fovV*0.3, 아래로 fovV*0.5 (BlockScanner와 동일)
        double fovVUp   = fovV * 0.3;
        double fovVDown = fovV * 0.5;

        Location eye    = player.getEyeLocation();
        float baseYaw   = eye.getYaw();
        float basePitch = eye.getPitch();

        List<EntityHit> hits = new ArrayList<>();

        for (Entity entity : player.getNearbyEntities(maxDist, maxDist, maxDist)) {
            if (!(entity instanceof LivingEntity)) continue;
            if (entity instanceof Player) continue; // 다른 플레이어는 제외

            EntityCategory category = categorize(entity);
            if (category == null) continue;

            // 엔티티 중심 좌표 (발 위치가 아닌 몸통 중앙)
            Location center = entity.getLocation().add(0.0, entity.getHeight() / 2.0, 0.0);
            double dist = eye.distance(center);
            if (dist > maxDist) continue;

            // 수평·수직 각도 오프셋 계산
            double hOffset = calcHOffset(eye, baseYaw, center);
            double vOffset = calcVOffset(eye, basePitch, center);

            // BlockScanner의 FOV 범위와 동일하게 체크
            if (Math.abs(hOffset) > fovH / 2.0) continue;
            if (vOffset < -fovVUp || vOffset > fovVDown) continue;

            hits.add(new EntityHit(center, dist, category));
        }

        return hits;
    }

    // ── 엔티티 분류 ─────────────────────────────────────────────

    /**
     * 엔티티를 4가지 카테고리로 분류.
     * null 반환 시 무시 (드롭 아이템, 화살 등 LivingEntity 아닌 것은 이미 필터됨).
     */
    private EntityCategory categorize(Entity entity) {
        // 1순위: NPC (마을 주민, 행상인)
        if (entity instanceof AbstractVillager) {
            return EntityCategory.NPC;
        }

        // 2순위: 적 (Monster 인터페이스 — 좀비, 스켈레톤, 크리퍼, 마녀, 슬라임 등)
        if (entity instanceof Monster) {
            return EntityCategory.HOSTILE;
        }

        // 3순위: 선공형 동물 (Neutral 인터페이스 — 늑대, 벌, 북극곰, 엔더맨(일부) 등)
        if (entity instanceof Neutral) {
            return EntityCategory.AGGRESSIVE;
        }

        // 4순위: 미공격 동물 (Animals, 수중 생물, 주변 생물, 골렘)
        if (entity instanceof Animals
                || entity instanceof WaterMob
                || entity instanceof Ambient
                || entity instanceof Golem) {
            return EntityCategory.PASSIVE;
        }

        return null;
    }

    // ── 상대 각도 계산 ───────────────────────────────────────────

    /**
     * 플레이어 시선 기준 수평 각도 오프셋 (도).
     * 양수 = 오른쪽, 음수 = 왼쪽.
     *
     * 마인크래프트 Yaw 공식: atan2(-x, z) → degrees
     */
    private double calcHOffset(Location eye, float baseYaw, Location target) {
        double dx = target.getX() - eye.getX();
        double dz = target.getZ() - eye.getZ();
        double entityYaw = Math.toDegrees(Math.atan2(-dx, dz));
        return normalizeAngle(entityYaw - baseYaw);
    }

    /**
     * 플레이어 시선 기준 수직 각도 오프셋 (도).
     * 양수 = 아래쪽, 음수 = 위쪽 (마인크래프트 Pitch 부호 방향과 동일).
     */
    private double calcVOffset(Location eye, float basePitch, Location target) {
        double dx = target.getX() - eye.getX();
        double dy = target.getY() - eye.getY();
        double dz = target.getZ() - eye.getZ();
        double hDist = Math.sqrt(dx * dx + dz * dz);
        // -atan2(dy, hDist): 위쪽 엔티티 → 음수 pitch (올려다보는 방향)
        double entityPitch = -Math.toDegrees(Math.atan2(dy, hDist));
        return entityPitch - basePitch;
    }

    /** 각도를 -180~+180 범위로 정규화 */
    private double normalizeAngle(double angle) {
        while (angle >  180.0) angle -= 360.0;
        while (angle < -180.0) angle += 360.0;
        return angle;
    }
}
