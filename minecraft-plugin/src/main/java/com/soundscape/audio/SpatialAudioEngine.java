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
 * 원본 sonifier.py와의 대응 관계:
 * ┌─────────────────┬────────────────────────────────────────────────────┐
 * │ 원본 (Python)   │ 마인크래프트 구현                                   │
 * ├─────────────────┼────────────────────────────────────────────────────┤
 * │ X축 스테레오     │ 블록의 실제 3D 위치에서 사운드 재생                  │
 * │ 패닝 (수동 계산) │ → 클라이언트 OpenAL이 자동으로 3D 패닝 처리          │
 * ├─────────────────┼────────────────────────────────────────────────────┤
 * │ Y축 피치        │ player.playSound()의 pitch 파라미터                  │
 * │ (행 위치 → Hz) │ Row 0(상단) = MAX_PITCH, Row N-1(하단) = MIN_PITCH   │
 * ├─────────────────┼────────────────────────────────────────────────────┤
 * │ Z축 볼륨        │ player.playSound()의 volume 파라미터                 │
 * │ (거리 → 진폭)   │ 가까울수록 크게, FAR_DIST 이상은 0                   │
 * └─────────────────┴────────────────────────────────────────────────────┘
 *
 * 핵심 장점: 사운드를 블록 실제 위치에서 재생하면 마인크래프트 클라이언트의
 * OpenAL 엔진이 진짜 HRTF 기반 3D 음향을 자동으로 처리합니다.
 * Python 코드처럼 수동으로 L/R 채널을 계산할 필요가 없습니다.
 */
public class SpatialAudioEngine {

    private final SoundScapePlugin plugin;

    public SpatialAudioEngine(SoundScapePlugin plugin) {
        this.plugin = plugin;
    }

    /**
     * 깊이 그리드를 분석하여 감지된 블록 위치마다 3D 사운드를 재생.
     *
     * @param player    소리를 들을 플레이어
     * @param depthGrid double[row][col] 깊이 배열 (BlockScanner.scan() 반환값)
     */
    public void play(Player player, double[][] depthGrid) {
        double maxDist = plugin.getConfig().getDouble("max_distance", 12.0);
        double nearDist = plugin.getConfig().getDouble("audio.near_dist", 1.0);
        double farRatio = plugin.getConfig().getDouble("audio.far_ratio", 0.85);
        float minPitch = (float) plugin.getConfig().getDouble("audio.min_pitch", 0.5);
        float maxPitch = (float) plugin.getConfig().getDouble("audio.max_pitch", 2.0);
        float maxVolume = (float) plugin.getConfig().getDouble("audio.max_volume", 1.0);

        double farDist = maxDist * farRatio;

        Sound sound = resolveSound(plugin.getConfig().getString("audio.sound", "BLOCK_NOTE_BLOCK_HARP"));

        int cols = plugin.getConfig().getInt("grid.cols", BlockScanner.DEFAULT_COLS);
        int rows = plugin.getConfig().getInt("grid.rows", BlockScanner.DEFAULT_ROWS);
        double fovH = plugin.getConfig().getDouble("fov.horizontal", 60.0);
        double fovV = plugin.getConfig().getDouble("fov.vertical", 40.0);

        Location eye = player.getEyeLocation();
        float baseYaw = eye.getYaw();
        float basePitch = eye.getPitch();

        for (int r = 0; r < rows; r++) {
            for (int c = 0; c < cols; c++) {
                double dist = depthGrid[r][c];

                // FAR_DIST 이상은 소리 없음 (원본의 FAR_DIST 동작과 동일)
                if (dist >= farDist) continue;

                // ── 볼륨 계산 (Z축 매핑) ──────────────────────────
                // 원본: ((FAR_DIST - clamped) / (FAR_DIST - NEAR_DIST)) ** 1.5
                double clamped = Math.max(nearDist, Math.min(dist, farDist));
                float volume = (float) (Math.pow((farDist - clamped) / (farDist - nearDist), 1.5) * maxVolume);
                if (volume < 0.01f) continue;

                // ── 피치 계산 (Y축 매핑) ──────────────────────────
                // row 0 = 상단(위쪽) → MAX_PITCH (고음)
                // row N-1 = 하단(아래쪽) → MIN_PITCH (저음)
                double pitchT = rows == 1 ? 0.5 : (double) r / (rows - 1);
                float pitch = (float) (maxPitch + pitchT * (minPitch - maxPitch));

                // ── 사운드 위치 계산 (X축 패닝 = OpenAL 자동 처리) ──
                // 레이와 동일한 방향으로 dist만큼 떨어진 지점에서 사운드 재생
                double hOffset = lerp(-fovH / 2.0, fovH / 2.0,
                        cols == 1 ? 0.5 : (double) c / (cols - 1));
                double vOffset = lerp(-fovV * 0.3, fovV * 0.5,
                        rows == 1 ? 0.5 : (double) r / (rows - 1));

                float rayYaw = (float) (baseYaw + hOffset);
                float rayPitch = (float) (basePitch + vOffset);

                double[] dir = yawPitchToDir(rayYaw, rayPitch);
                Location soundLoc = eye.clone().add(
                        dir[0] * dist,
                        dir[1] * dist,
                        dir[2] * dist
                );

                // 사운드를 블록 위치에서 재생
                // 클라이언트 OpenAL이 플레이어 위치 기준 3D 패닝을 자동으로 처리
                player.playSound(soundLoc, sound, SoundCategory.PLAYERS, volume, pitch);
            }
        }
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

    private Sound resolveSound(String name) {
        try {
            return Sound.valueOf(name);
        } catch (IllegalArgumentException e) {
            plugin.getLogger().warning("알 수 없는 사운드: " + name + " → BLOCK_NOTE_BLOCK_HARP 사용");
            return Sound.BLOCK_NOTE_BLOCK_HARP;
        }
    }
}
