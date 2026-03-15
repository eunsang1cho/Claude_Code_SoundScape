package com.soundscape.listener;

import com.soundscape.SoundScapePlugin;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextDecoration;
import net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer;
import org.bukkit.FluidCollisionMode;
import org.bukkit.Location;
import org.bukkit.Sound;
import org.bukkit.block.Block;
import org.bukkit.entity.Entity;
import org.bukkit.entity.LivingEntity;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerSwapHandItemsEvent;
import org.bukkit.util.RayTraceResult;
import org.bukkit.util.Vector;

/**
 * SonarPingListener — F키 소나 핑 기능
 *
 * SoundScape가 활성화된 상태에서 F키(오프핸드 스왑)를 누르면:
 *   1. 크로스헤어 방향으로 레이캐스트 (블록 + 엔티티 동시)
 *   2. 더 가까운 대상의 이름 + 거리를 ActionBar에 표시
 *   3. 거리에 따른 피치 변화 핑 사운드 재생 (가까울수록 고음)
 *
 * 아이템 스왑 동작은 취소되어 F키가 소나 전용 키로 동작.
 * SoundScape 비활성화 상태에서는 일반 F키 동작이 허용됨.
 *
 * 거리 색상:
 *   빨강(RED)    ≤ 2m  — 즉각 위험
 *   노랑(YELLOW) ≤ 5m  — 주의 필요
 *   초록(GREEN)  > 5m  — 원거리
 */
public class SonarPingListener implements Listener {

    /** 소나 핑의 최대 감지 거리 (블록 단위) */
    private static final double MAX_PING_RANGE = 20.0;

    private final SoundScapePlugin plugin;

    public SonarPingListener(SoundScapePlugin plugin) {
        this.plugin = plugin;
    }

    @EventHandler(priority = EventPriority.NORMAL, ignoreCancelled = false)
    public void onSwapHands(PlayerSwapHandItemsEvent event) {
        Player player = event.getPlayer();

        // SoundScape 비활성화 상태면 일반 F키 동작 허용
        if (!plugin.isEnabled(player)) return;

        // 아이템 스왑 취소 — 소나 전용 키로 동작
        event.setCancelled(true);

        Location eye = player.getEyeLocation();
        Vector   dir = eye.getDirection().normalize();

        // ── 레이캐스트: 블록 + 엔티티 ──────────────────────────
        RayTraceResult blockResult = player.getWorld().rayTraceBlocks(
                eye, dir, MAX_PING_RANGE, FluidCollisionMode.NEVER, false
        );

        RayTraceResult entityResult = player.getWorld().rayTraceEntities(
                eye, dir, MAX_PING_RANGE,
                e -> e != player && (e instanceof LivingEntity || e.isValid())
        );

        double blockDist  = distOf(eye, blockResult);
        double entityDist = distOf(eye, entityResult);

        // ── 더 가까운 대상 선택 ──────────────────────────────────
        String targetName;
        double targetDist;

        if (entityDist < blockDist && entityResult != null) {
            targetName = formatEntityName(entityResult.getHitEntity());
            targetDist = entityDist;
        } else if (blockResult != null && blockDist < MAX_PING_RANGE) {
            targetName = formatBlockName(blockResult.getHitBlock());
            targetDist = blockDist;
        } else {
            // 범위 내 감지 없음
            player.sendActionBar(Component.text("[소나] 감지 없음", NamedTextColor.GRAY));
            player.playSound(eye, Sound.BLOCK_NOTE_BLOCK_BASS, 0.4f, 0.5f);
            return;
        }

        // ── ActionBar 출력 ───────────────────────────────────────
        // 거리에 따라 색상 변화 (에코로케이션 긴박감 표현)
        NamedTextColor distColor = targetDist <= 2.0 ? NamedTextColor.RED
                : targetDist <= 5.0                  ? NamedTextColor.YELLOW
                :                                      NamedTextColor.GREEN;

        Component msg = Component.text()
                .append(Component.text("[소나] ", NamedTextColor.AQUA))
                .append(Component.text(targetName, NamedTextColor.WHITE, TextDecoration.BOLD))
                .append(Component.text("  "))
                .append(Component.text(String.format("%.1fm", targetDist), distColor, TextDecoration.BOLD))
                .build();

        player.sendActionBar(msg);

        // ── 거리 기반 핑 사운드 ──────────────────────────────────
        // 가까울수록 고음 (2.0f), 멀수록 저음 (0.5f) — 에코로케이션 원칙
        float pitch = (float) Math.max(0.5, Math.min(2.0, 2.0 - targetDist / 13.3));
        player.playSound(eye, Sound.BLOCK_NOTE_BLOCK_PLING, 0.6f, pitch);
    }

    // ── 내부 유틸리티 ────────────────────────────────────────────

    /** 눈 위치에서 레이캐스트 히트 위치까지의 거리. 히트 없으면 MAX_VALUE */
    private double distOf(Location eye, RayTraceResult result) {
        if (result == null || result.getHitPosition() == null) return Double.MAX_VALUE;
        return eye.toVector().distance(result.getHitPosition());
    }

    /**
     * 블록 Material enum → 읽기 좋은 이름
     * 예: OAK_PLANKS → "Oak Planks"
     *     STONE_BRICK_STAIRS → "Stone Brick Stairs"
     */
    private String formatBlockName(Block block) {
        if (block == null) return "Unknown Block";
        return enumToWords(block.getType().name());
    }

    /**
     * 엔티티 → 읽기 좋은 이름
     * 커스텀 이름표가 있으면 우선 사용.
     * 예: ZOMBIE → "Zombie"  /  IRON_GOLEM → "Iron Golem"
     */
    private String formatEntityName(Entity entity) {
        if (entity == null) return "Unknown Entity";
        if (entity.customName() != null) {
            return PlainTextComponentSerializer.plainText().serialize(entity.customName());
        }
        return enumToWords(entity.getType().name());
    }

    /** UPPER_SNAKE_CASE → "Title Case Words" */
    private String enumToWords(String enumName) {
        String[] parts = enumName.split("_");
        StringBuilder sb = new StringBuilder();
        for (String part : parts) {
            if (sb.length() > 0) sb.append(' ');
            if (part.isEmpty()) continue;
            sb.append(Character.toUpperCase(part.charAt(0)));
            sb.append(part.substring(1).toLowerCase());
        }
        return sb.toString();
    }
}
