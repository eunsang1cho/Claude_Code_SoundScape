package com.soundscape.audio;

import com.soundscape.SoundScapePlugin;
import com.soundscape.entity.EntityHit;
import org.bukkit.Location;
import org.bukkit.Sound;
import org.bukkit.SoundCategory;
import org.bukkit.entity.Player;

import java.util.List;

/**
 * SpatialAudioEngine - 깊이 그리드와 엔티티 목록을 마인크래프트 3D 위치 사운드로 변환
 *
 * ── 블록 사운드 (play) ────────────────────────────────────────────────────
 *   ScanType에 따라 세 가지 청각화 전략 선택:
 *     FULL    : 7×5 전체 셀 → 각 위치에서 소리
 *     COLUMN  : 열별 최근접 블록 1개씩 소리
 *     NEAREST : 전체 최근접 블록 1개만 소리
 *
 *   groundY 기반 바닥 필터:
 *     히트 포인트 Y ≤ groundY + FLOOR_TOLERANCE 이면 바닥으로 판단해 무음.
 *     (평지 바닥 소음 제거; 점프 중에도 마지막 서 있던 Y 기준 유지)
 *
 * ── 엔티티 사운드 (playEntities) ──────────────────────────────────────────
 *   EntityScanner가 반환한 EntityHit 목록을 소리로 변환.
 *   엔티티 중심 위치에서 소리 재생 → OpenAL 3D 패닝 자동 처리.
 *   볼륨은 거리 기반(블록과 동일 커브), 피치는 카테고리별 고정값:
 *     NPC       → 1.0 (주민 흠흠)
 *     HOSTILE   → 0.8 (좀비 으르렁, 낮은 경고음)
 *     PASSIVE   → 1.2 (소 음메, 밝은 소리)
 *     AGGRESSIVE→ 0.75 (늑대 그로울, 위험 경고)
 *
 * ── 3축 매핑 (블록·엔티티 공통) ─────────────────────────────────────────
 *   X축 (좌우) → playSound(location) 으로 OpenAL 자동 스테레오 패닝
 *   Y축 (높이) → 블록: pitch (row 위치), 엔티티: 카테고리별 고정 pitch
 *   Z축 (거리) → volume (1.5승 지수 커브, 원본 sonifier.py와 동일)
 */
public class SpatialAudioEngine {

    private final SoundScapePlugin plugin;

    /**
     * 이 값 이하(groundY + tolerance)로 레이가 히트하면 바닥으로 판단.
     * 0.5 블록: 반 블록 높이 장애물은 감지하되 평지 바닥은 무음.
     */
    private static final double FLOOR_TOLERANCE = 0.5;

    public SpatialAudioEngine(SoundScapePlugin plugin) {
        this.plugin = plugin;
    }

    // ── 블록 사운드 진입점 ─────────────────────────────────────

    /**
     * ScanType에 따라 적절한 재생 전략 선택.
     *
     * @param groundY 마지막으로 서 있던 발 Y (바닥 필터 기준)
     */
    public void play(Player player, double[][] depthGrid, ScanType type, double groundY) {
        switch (type) {
            case FULL    -> playFull(player, depthGrid, groundY);
            case COLUMN  -> playColumn(player, depthGrid, groundY);
            case NEAREST -> playNearest(player, depthGrid, groundY);
        }
    }

    // ── Type 1: FULL ──────────────────────────────────────────

    private void playFull(Player player, double[][] depthGrid, double groundY) {
        AudioConfig cfg = new AudioConfig();
        Location eye = player.getEyeLocation();
        int rows = depthGrid.length;
        int cols = rows > 0 ? depthGrid[0].length : 0;

        for (int r = 0; r < rows; r++) {
            for (int c = 0; c < cols; c++) {
                double dist = depthGrid[r][c];
                if (dist >= cfg.farDist) continue;

                double[] dir = dirForCell(eye, r, c, rows, cols, cfg);
                if (isFloor(eye, dir, dist, groundY)) continue;   // 바닥 필터

                float volume = calcVolume(dist, cfg);
                if (volume < 0.01f) continue;

                float pitch = calcPitch(r, rows, cfg);
                Location soundLoc = soundLocation(eye, dir, dist);
                player.playSound(soundLoc, cfg.sound, SoundCategory.PLAYERS, volume, pitch);
            }
        }
    }

    // ── Type 2: COLUMN ────────────────────────────────────────

    private void playColumn(Player player, double[][] depthGrid, double groundY) {
        AudioConfig cfg = new AudioConfig();
        Location eye = player.getEyeLocation();
        int rows = depthGrid.length;
        int cols = rows > 0 ? depthGrid[0].length : 0;

        for (int c = 0; c < cols; c++) {
            double minDist = cfg.farDist;
            int    minRow  = -1;

            for (int r = 0; r < rows; r++) {
                double dist = depthGrid[r][c];
                if (dist >= cfg.farDist) continue;

                double[] dir = dirForCell(eye, r, c, rows, cols, cfg);
                if (isFloor(eye, dir, dist, groundY)) continue;   // 바닥 필터

                if (dist < minDist) { minDist = dist; minRow = r; }
            }

            if (minRow < 0) continue;

            float volume = calcVolume(minDist, cfg);
            if (volume < 0.01f) continue;

            double[] dir = dirForCell(eye, minRow, c, rows, cols, cfg);
            float pitch = calcPitch(minRow, rows, cfg);
            player.playSound(soundLocation(eye, dir, minDist), cfg.sound, SoundCategory.PLAYERS, volume, pitch);
        }
    }

    // ── Type 3: NEAREST ───────────────────────────────────────

    private void playNearest(Player player, double[][] depthGrid, double groundY) {
        AudioConfig cfg = new AudioConfig();
        Location eye = player.getEyeLocation();
        int rows = depthGrid.length;
        int cols = rows > 0 ? depthGrid[0].length : 0;

        double minDist = cfg.farDist;
        int minRow = -1, minCol = -1;

        for (int r = 0; r < rows; r++) {
            for (int c = 0; c < cols; c++) {
                double dist = depthGrid[r][c];
                if (dist >= cfg.farDist) continue;

                double[] dir = dirForCell(eye, r, c, rows, cols, cfg);
                if (isFloor(eye, dir, dist, groundY)) continue;   // 바닥 필터

                if (dist < minDist) { minDist = dist; minRow = r; minCol = c; }
            }
        }

        if (minRow < 0) return;

        float volume = calcVolume(minDist, cfg);
        if (volume < 0.01f) return;

        double[] dir = dirForCell(eye, minRow, minCol, rows, cols, cfg);
        float pitch = calcPitch(minRow, rows, cfg);
        player.playSound(soundLocation(eye, dir, minDist), cfg.sound, SoundCategory.PLAYERS, volume, pitch);
    }

    // ── 엔티티 사운드 ─────────────────────────────────────────

    /**
     * FOV 내 감지된 엔티티 목록을 소리로 변환.
     * 소리는 엔티티 실제 위치에서 재생 → OpenAL이 3D 패닝 자동 처리.
     */
    public void playEntities(Player player, List<EntityHit> hits) {
        if (hits.isEmpty()) return;
        AudioConfig cfg = new AudioConfig();

        for (EntityHit hit : hits) {
            if (hit.dist >= cfg.farDist) continue;

            float volume = calcVolume(hit.dist, cfg);
            if (volume < 0.01f) continue;

            // 카테고리별 고정 피치 사용 (높이 매핑 없음 — 엔티티 특성으로 구분)
            player.playSound(hit.position, hit.category.sound,
                    SoundCategory.PLAYERS, volume, hit.category.pitch);
        }
    }

    // ── 공통 계산 헬퍼 ─────────────────────────────────────────

    /**
     * 그리드 셀 (row, col)에 해당하는 방향 단위 벡터.
     * BlockScanner.scan()의 레이 방향과 동일한 공식 사용.
     */
    private double[] dirForCell(Location eye, int row, int col,
                                int totalRows, int totalCols, AudioConfig cfg) {
        double hOffset = lerp(-cfg.fovH / 2.0, cfg.fovH / 2.0,
                totalCols == 1 ? 0.5 : (double) col / (totalCols - 1));
        double vOffset = lerp(-cfg.fovV * 0.3, cfg.fovV * 0.5,
                totalRows == 1 ? 0.5 : (double) row / (totalRows - 1));
        return yawPitchToDir(
                (float) (eye.getYaw()   + hOffset),
                (float) (eye.getPitch() + vOffset));
    }

    /**
     * 히트 포인트가 바닥인지 판단.
     * hitY = eye.y + dir.y * dist ≤ groundY + FLOOR_TOLERANCE 이면 바닥.
     */
    private boolean isFloor(Location eye, double[] dir, double dist, double groundY) {
        double hitY = eye.getY() + dir[1] * dist;
        return hitY <= groundY + FLOOR_TOLERANCE;
    }

    /** 소리 재생 위치 = eye + dir * dist */
    private Location soundLocation(Location eye, double[] dir, double dist) {
        return eye.clone().add(dir[0] * dist, dir[1] * dist, dir[2] * dist);
    }

    /** 볼륨 계산: ((farDist - clamped) / (farDist - nearDist))^1.5 × maxVolume */
    private float calcVolume(double dist, AudioConfig cfg) {
        double clamped = Math.max(cfg.nearDist, Math.min(dist, cfg.farDist));
        return (float) (Math.pow((cfg.farDist - clamped) / (cfg.farDist - cfg.nearDist), 1.5)
                * cfg.maxVolume);
    }

    /** 피치 계산: row 0(상단) = maxPitch(고음), row N-1(하단) = minPitch(저음) */
    private float calcPitch(int row, int totalRows, AudioConfig cfg) {
        double t = totalRows == 1 ? 0.5 : (double) row / (totalRows - 1);
        return (float) (cfg.maxPitch + t * (cfg.minPitch - cfg.maxPitch));
    }

    private double[] yawPitchToDir(float yawDeg, float pitchDeg) {
        double yaw   = Math.toRadians(yawDeg);
        double pitch = Math.toRadians(pitchDeg);
        double x = -Math.sin(yaw) * Math.cos(pitch);
        double y = -Math.sin(pitch);
        double z =  Math.cos(yaw) * Math.cos(pitch);
        double len = Math.sqrt(x * x + y * y + z * z);
        return new double[]{x / len, y / len, z / len};
    }

    private double lerp(double a, double b, double t) {
        return a + (b - a) * t;
    }

    // ── 설정 캐시 ─────────────────────────────────────────────

    /** play() 호출마다 config를 반복 조회하지 않도록 한 번에 읽는 내부 클래스 */
    private class AudioConfig {
        final Sound  sound;
        final double nearDist;
        final double farDist;
        final float  minPitch;
        final float  maxPitch;
        final float  maxVolume;
        final double fovH;
        final double fovV;

        AudioConfig() {
            double maxDistance = plugin.getConfig().getDouble("max_distance", 12.0);
            this.nearDist  = plugin.getConfig().getDouble("audio.near_dist", 1.0);
            this.farDist   = maxDistance * plugin.getConfig().getDouble("audio.far_ratio", 0.85);
            this.minPitch  = (float) plugin.getConfig().getDouble("audio.min_pitch", 0.5);
            this.maxPitch  = (float) plugin.getConfig().getDouble("audio.max_pitch", 2.0);
            this.maxVolume = (float) plugin.getConfig().getDouble("audio.max_volume", 1.0);
            this.fovH      = plugin.getConfig().getDouble("fov.horizontal", 60.0);
            this.fovV      = plugin.getConfig().getDouble("fov.vertical", 40.0);
            this.sound     = resolveSound(
                    plugin.getConfig().getString("audio.sound", "BLOCK_NOTE_BLOCK_HARP"));
        }

        private Sound resolveSound(String name) {
            try { return Sound.valueOf(name); }
            catch (IllegalArgumentException e) {
                plugin.getLogger().warning("알 수 없는 사운드: " + name + " → BLOCK_NOTE_BLOCK_HARP");
                return Sound.BLOCK_NOTE_BLOCK_HARP;
            }
        }
    }
}
