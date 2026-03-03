package com.soundscape.scanner;

import com.soundscape.SoundScapePlugin;
import org.bukkit.FluidCollisionMode;
import org.bukkit.Location;
import org.bukkit.entity.Player;
import org.bukkit.util.RayTraceResult;
import org.bukkit.util.Vector;

/**
 * BlockScanner - 플레이어 전방의 블록을 레이캐스트 그리드로 스캔
 *
 * Godot 시뮬레이터의 echolocation.gd와 동일한 개념:
 *   - GRID_COLS × GRID_ROWS 개의 레이를 수평/수직으로 배치
 *   - 각 레이의 충돌 거리를 2D 깊이 그리드로 반환
 *
 * 그리드 인덱스 의미:
 *   grid[0][*]        = 상단 행 → 높은 피치 (천장 방향)
 *   grid[ROWS-1][*]   = 하단 행 → 낮은 피치 (바닥 방향)
 *   grid[*][0]        = 좌측 열 → 왼쪽 스테레오
 *   grid[*][COLS-1]   = 우측 열 → 오른쪽 스테레오
 */
public class BlockScanner {

    private final SoundScapePlugin plugin;

    // 설정 기본값 (config.yml로 재정의 가능)
    public static final int DEFAULT_COLS = 7;
    public static final int DEFAULT_ROWS = 5;

    public BlockScanner(SoundScapePlugin plugin) {
        this.plugin = plugin;
    }

    /**
     * 플레이어 주변을 레이캐스트로 스캔하여 깊이 그리드를 반환.
     *
     * @param player 스캔 대상 플레이어
     * @return double[row][col] 거리 배열.
     *         값 범위: 0.0(바로 앞) ~ max_distance(아무것도 없음)
     */
    public double[][] scan(Player player) {
        int cols = plugin.getConfig().getInt("grid.cols", DEFAULT_COLS);
        int rows = plugin.getConfig().getInt("grid.rows", DEFAULT_ROWS);
        double maxDist = plugin.getConfig().getDouble("max_distance", 12.0);
        double fovH = plugin.getConfig().getDouble("fov.horizontal", 60.0);
        double fovV = plugin.getConfig().getDouble("fov.vertical", 40.0);

        Location eye = player.getEyeLocation();
        float baseYaw = eye.getYaw();
        float basePitch = eye.getPitch();

        double[][] grid = new double[rows][cols];

        for (int r = 0; r < rows; r++) {
            for (int c = 0; c < cols; c++) {
                // 수평: 좌(-fovH/2) ~ 우(+fovH/2)
                double hOffset = lerp(-fovH / 2.0, fovH / 2.0,
                        cols == 1 ? 0.5 : (double) c / (cols - 1));

                // 수직: 위(-pitch offset, 위를 봄) ~ 아래(+pitch offset, 아래를 봄)
                // row 0 = 상단(위쪽), row ROWS-1 = 하단(아래쪽)
                double vOffset = lerp(-fovV * 0.3, fovV * 0.5,
                        rows == 1 ? 0.5 : (double) r / (rows - 1));

                float rayYaw = (float) (baseYaw + hOffset);
                float rayPitch = (float) (basePitch + vOffset);

                Vector dir = yawPitchToDirection(rayYaw, rayPitch);

                RayTraceResult result = player.getWorld().rayTraceBlocks(
                        eye, dir, maxDist, FluidCollisionMode.NEVER, false
                );

                if (result != null && result.getHitPosition() != null) {
                    double dist = eye.toVector().distance(result.getHitPosition());
                    grid[r][c] = Math.max(0.01, Math.min(dist, maxDist));
                } else {
                    grid[r][c] = maxDist;
                }
            }
        }

        return grid;
    }

    // ── 내부 유틸리티 ──────────────────────────────────────────

    /**
     * 마인크래프트 Yaw/Pitch(도) → 방향 단위 벡터
     *
     * 마인크래프트 좌표계:
     *   Yaw  0   = south (+Z), 90 = west (-X), -90 = east (+X), 180 = north (-Z)
     *   Pitch -90 = 위쪽, 0 = 수평, 90 = 아래쪽
     */
    private Vector yawPitchToDirection(float yawDeg, float pitchDeg) {
        double yaw = Math.toRadians(yawDeg);
        double pitch = Math.toRadians(pitchDeg);

        double x = -Math.sin(yaw) * Math.cos(pitch);
        double y = -Math.sin(pitch);
        double z = Math.cos(yaw) * Math.cos(pitch);

        return new Vector(x, y, z).normalize();
    }

    private double lerp(double a, double b, double t) {
        return a + (b - a) * t;
    }
}
