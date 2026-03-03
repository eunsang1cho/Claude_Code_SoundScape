package com.soundscape;

import com.soundscape.audio.SpatialAudioEngine;
import com.soundscape.command.SoundScapeCommand;
import com.soundscape.listener.PlayerListener;
import com.soundscape.scanner.BlockScanner;
import org.bukkit.entity.Player;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitRunnable;

import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

/**
 * SoundScapePlugin - 마인크래프트용 공간 청각화 플러그인
 *
 * 원본 SoundScape 시스템의 3축 매핑 원칙을 마인크래프트에 적용:
 *   X축 (좌우)  → 마인크래프트 OpenAL 3D 위치 기반 스테레오 패닝 (자동)
 *   Y축 (높이)  → 사운드 피치 (높은 위치 = 고음, 낮은 위치 = 저음)
 *   Z축 (거리)  → 사운드 볼륨 (가까울수록 크게)
 *
 * 핵심 차이점: 카메라 깊이 맵 대신 RayTrace로 블록을 탐지하므로
 * 마인크래프트의 클라이언트 OpenAL이 진짜 3D 위치 음향을 처리함.
 */
public class SoundScapePlugin extends JavaPlugin {

    private BlockScanner scanner;
    private SpatialAudioEngine audioEngine;

    // 활성화된 플레이어 UUID 집합 (thread-safe)
    private final Set<UUID> enabledPlayers = Collections.synchronizedSet(new HashSet<>());

    @Override
    public void onEnable() {
        saveDefaultConfig();

        scanner = new BlockScanner(this);
        audioEngine = new SpatialAudioEngine(this);

        getServer().getPluginManager().registerEvents(new PlayerListener(this), this);

        SoundScapeCommand cmd = new SoundScapeCommand(this);
        getCommand("soundscape").setExecutor(cmd);
        getCommand("soundscape").setTabCompleter(cmd);

        // 기본 활성화 여부 확인 후 로그인 플레이어에 적용
        startScanLoop();

        getLogger().info("SoundScape 플러그인이 활성화되었습니다.");
        getLogger().info("  /soundscape toggle 로 공간 청각화 ON/OFF");
    }

    @Override
    public void onDisable() {
        getLogger().info("SoundScape 플러그인이 비활성화되었습니다.");
    }

    // ── 스캔 루프 ──────────────────────────────────────────────

    private void startScanLoop() {
        double intervalSec = getConfig().getDouble("update_interval_seconds", 0.2);
        long intervalTicks = Math.max(1L, Math.round(intervalSec * 20.0));

        new BukkitRunnable() {
            @Override
            public void run() {
                for (Player player : getServer().getOnlinePlayers()) {
                    if (!enabledPlayers.contains(player.getUniqueId())) continue;

                    // 스캔 및 오디오 재생 (메인 스레드에서 실행되므로 안전)
                    double[][] depthGrid = scanner.scan(player);
                    audioEngine.play(player, depthGrid);
                }
            }
        }.runTaskTimer(this, 20L, intervalTicks);
    }

    // ── 공개 API ──────────────────────────────────────────────

    /** 플레이어의 SoundScape 활성화 여부 반환 */
    public boolean isEnabled(Player player) {
        return enabledPlayers.contains(player.getUniqueId());
    }

    /**
     * 플레이어의 SoundScape 활성화 상태를 토글.
     * @return 토글 후 상태 (true = 활성화됨)
     */
    public boolean toggle(Player player) {
        UUID uid = player.getUniqueId();
        if (enabledPlayers.contains(uid)) {
            enabledPlayers.remove(uid);
            return false;
        } else {
            enabledPlayers.add(uid);
            return true;
        }
    }

    public Set<UUID> getEnabledPlayers() { return enabledPlayers; }
    public BlockScanner getScanner() { return scanner; }
    public SpatialAudioEngine getAudioEngine() { return audioEngine; }
}
