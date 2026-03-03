package com.soundscape.audio;

import com.soundscape.SoundScapePlugin;
import com.soundscape.scanner.BlockScanner;
import org.bukkit.Location;
import org.bukkit.Sound;
import org.bukkit.SoundCategory;
import org.bukkit.entity.Player;

/**
 * SpatialAudioEngine - 깊이 그리드를 마인크래프트 3D 위치 사운드로 변환
 *
 * ScanType에 따라 세 가지 청각화 전략을 지원:
 *
 *   FULL    : 7×5 전체 셀 → 각 감지 위치에서 소리 재생
 *             가장 많은 정보. 복잡한 환경 인식에 적합.
 *
 *   COLUMN  : 7개 열 → 열마다 가장 가까운 블록 1개씩 소리
 *             수평 방향 파악에 집중. The vOICe의 수평 스윕과 유사.
 *             audio_feedback.gd의 열 합산 방식을 단순화한 버전.
 *
 *   NEAREST : 전체 그리드 → 가장 가까운 블록 1개만 소리
 *             최소한의 정보로 즉각적인 위험 방향·거리 전달.
 *
 * 3축 매핑 (세 모드 공통):
 *   X축 (좌우)  → 소리 위치 기반 OpenAL 자동 스테레오 패닝
 *   Y축 (높이)  → pitch 파라미터 (row 0 상단 = 고음, row N-1 하단 = 저음)
 *   Z축 (거리)  → volume 파라미터 (1.5승 지수 커브, 원본 sonifier.py와 동일)
 */
public class SpatialAudioEngine {

    private final SoundScapePlugin plugin;

    public SpatialAudioEngine(SoundScapePlugin plugin) {
        this.plugin = plugin;
    }

    /**
     * ScanType에 따라 적절한 재생 전략을 선택.
     *
     * @param player    소리를 들을 플레이어
     * @param depthGrid double[row][col] 깊이 배열 (BlockScanner.scan() 반환값)
     * @param type      청각화 모드 (FULL / COLUMN / NEAREST)
     */
    public void play(Player player, double[][] depthGrid, ScanType type) {
        switch (type) {
            case FULL    -> playFull(player, depthGrid);
            case COLUMN  -> playColumn(player, depthGrid);
            case NEAREST -> playNearest(player, depthGrid);
        }
    }

    // ── Type 1: FULL ──────────────────────────────────────────
    // 7×5 전체 그리드의 감지된 각 셀마다 소리 재생.
    // 가장 많은 소리가 나지만 공간 전체를 파악할 수 있음.

    private void playFull(Player player, double[][] depthGrid) {
        AudioConfig cfg = new AudioConfig();
        int rows = depthGrid.length;
        int cols = rows > 0 ? depthGrid[0].length : 0;

        for (int r = 0; r < rows; r++) {
            for (int c = 0; c < cols; c++) {
                double dist = depthGrid[r][c];
                if (dist >= cfg.farDist) continue;

                float volume = calcVolume(dist, cfg);
                if (volume < 0.01f) continue;

                float pitch = calcPitch(r, rows, cfg);
                Location soundLoc = calcSoundLocation(player, r, c, rows, cols, dist, cfg);
                player.playSound(soundLoc, cfg.sound, SoundCategory.PLAYERS, volume, pitch);
            }
        }
    }

    // ── Type 2: COLUMN ────────────────────────────────────────
    // 각 열(수평 방향)에서 가장 가까운 블록 하나만 선택하여 소리 재생.
    // 총 cols개(기본 7개)의 소리만 발생 → 수평 장애물 위치 파악에 집중.
    // audio_feedback.gd의 패닝 합산 방식에서 영감.

    private void playColumn(Player player, double[][] depthGrid) {
        AudioConfig cfg = new AudioConfig();
        int rows = depthGrid.length;
        int cols = rows > 0 ? depthGrid[0].length : 0;

        for (int c = 0; c < cols; c++) {
            // 이 열에서 가장 가까운 행 찾기
            double minDist = cfg.farDist;
            int minRow = -1;
            for (int r = 0; r < rows; r++) {
                if (depthGrid[r][c] < minDist) {
                    minDist = depthGrid[r][c];
                    minRow = r;
                }
            }
            if (minRow < 0) continue; // 이 열에 감지된 블록 없음

            float volume = calcVolume(minDist, cfg);
            if (volume < 0.01f) continue;

            float pitch = calcPitch(minRow, rows, cfg);
            Location soundLoc = calcSoundLocation(player, minRow, c, rows, cols, minDist, cfg);
            player.playSound(soundLoc, cfg.sound, SoundCategory.PLAYERS, volume, pitch);
        }
    }

    // ── Type 3: NEAREST ───────────────────────────────────────
    // 전체 그리드에서 가장 가까운 블록 단 하나만 소리 재생.
    // 방향(패닝)과 거리(볼륨), 높이(피치)만 단순하게 전달.
    // 즉각적인 위험 감지 또는 처음 입문자에게 적합.

    private void playNearest(Player player, double[][] depthGrid) {
        AudioConfig cfg = new AudioConfig();
        int rows = depthGrid.length;
        int cols = rows > 0 ? depthGrid[0].length : 0;

        double minDist = cfg.farDist;
        int minRow = -1, minCol = -1;

        for (int r = 0; r < rows; r++) {
            for (int c = 0; c < cols; c++) {
                if (depthGrid[r][c] < minDist) {
                    minDist = depthGrid[r][c];
                    minRow = r;
                    minCol = c;
                }
            }
        }

        if (minRow < 0) return; // 아무것도 감지 안 됨

        float volume = calcVolume(minDist, cfg);
        if (volume < 0.01f) return;

        float pitch = calcPitch(minRow, rows, cfg);
        Location soundLoc = calcSoundLocation(player, minRow, minCol, rows, cols, minDist, cfg);
        player.playSound(soundLoc, cfg.sound, SoundCategory.PLAYERS, volume, pitch);
    }

    // ── 공통 계산 로직 ─────────────────────────────────────────

    /**
     * 볼륨 계산 (Z축 매핑).
     * 원본 sonifier.py: ((FAR - clamped) / (FAR - NEAR)) ** 1.5
     */
    private float calcVolume(double dist, AudioConfig cfg) {
        double clamped = Math.max(cfg.nearDist, Math.min(dist, cfg.farDist));
        return (float) (Math.pow((cfg.farDist - clamped) / (cfg.farDist - cfg.nearDist), 1.5)
                * cfg.maxVolume);
    }

    /**
     * 피치 계산 (Y축 매핑).
     * row 0 = 상단(위쪽) = maxPitch(고음)
     * row N-1 = 하단(아래쪽) = minPitch(저음)
     */
    private float calcPitch(int row, int totalRows, AudioConfig cfg) {
        double t = totalRows == 1 ? 0.5 : (double) row / (totalRows - 1);
        return (float) (cfg.maxPitch + t * (cfg.minPitch - cfg.maxPitch));
    }

    /**
     * 소리 재생 위치 계산 (X축 패닝 = OpenAL 자동 처리).
     * 레이와 동일한 방향으로 dist만큼 이동한 월드 좌표.
     */
    private Location calcSoundLocation(Player player, int row, int col,
                                       int totalRows, int totalCols,
                                       double dist, AudioConfig cfg) {
        Location eye = player.getEyeLocation();
        float baseYaw = eye.getYaw();
        float basePitch = eye.getPitch();

        double hOffset = lerp(-cfg.fovH / 2.0, cfg.fovH / 2.0,
                totalCols == 1 ? 0.5 : (double) col / (totalCols - 1));
        double vOffset = lerp(-cfg.fovV * 0.3, cfg.fovV * 0.5,
                totalRows == 1 ? 0.5 : (double) row / (totalRows - 1));

        double[] dir = yawPitchToDir((float) (baseYaw + hOffset), (float) (basePitch + vOffset));
        return eye.clone().add(dir[0] * dist, dir[1] * dist, dir[2] * dist);
    }

    // ── 내부 유틸리티 ──────────────────────────────────────────

    private double[] yawPitchToDir(float yawDeg, float pitchDeg) {
        double yaw = Math.toRadians(yawDeg);
        double pitch = Math.toRadians(pitchDeg);
        double x = -Math.sin(yaw) * Math.cos(pitch);
        double y = -Math.sin(pitch);
        double z = Math.cos(yaw) * Math.cos(pitch);
        double len = Math.sqrt(x * x + y * y + z * z);
        return new double[]{x / len, y / len, z / len};
    }

    private double lerp(double a, double b, double t) {
        return a + (b - a) * t;
    }

    // ── 설정 캐시 클래스 ───────────────────────────────────────

    /** play() 호출마다 config를 반복 조회하지 않도록 한 번에 읽는 내부 클래스 */
    private class AudioConfig {
        final Sound sound;
        final double nearDist;
        final double farDist;
        final float minPitch;
        final float maxPitch;
        final float maxVolume;
        final double fovH;
        final double fovV;

        AudioConfig() {
            double maxDistance = plugin.getConfig().getDouble("max_distance", 12.0);
            this.nearDist   = plugin.getConfig().getDouble("audio.near_dist", 1.0);
            this.farDist    = maxDistance * plugin.getConfig().getDouble("audio.far_ratio", 0.85);
            this.minPitch   = (float) plugin.getConfig().getDouble("audio.min_pitch", 0.5);
            this.maxPitch   = (float) plugin.getConfig().getDouble("audio.max_pitch", 2.0);
            this.maxVolume  = (float) plugin.getConfig().getDouble("audio.max_volume", 1.0);
            this.fovH       = plugin.getConfig().getDouble("fov.horizontal", 60.0);
            this.fovV       = plugin.getConfig().getDouble("fov.vertical", 40.0);
            this.sound      = resolveSound(plugin.getConfig().getString("audio.sound", "BLOCK_NOTE_BLOCK_HARP"));
        }

        private Sound resolveSound(String name) {
            try {
                return Sound.valueOf(name);
            } catch (IllegalArgumentException e) {
                plugin.getLogger().warning("알 수 없는 사운드: " + name + " → BLOCK_NOTE_BLOCK_HARP 사용");
                return Sound.BLOCK_NOTE_BLOCK_HARP;
            }
        }
    }
}
