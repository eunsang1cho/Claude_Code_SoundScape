package com.soundscape;

import com.soundscape.audio.ScanType;
import com.soundscape.audio.SpatialAudioEngine;
import com.soundscape.command.SoundScapeCommand;
import com.soundscape.listener.PlayerListener;
import com.soundscape.scanner.BlockScanner;
import org.bukkit.entity.Player;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitRunnable;

import java.util.Collections;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

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
 *
 * 청각화 모드 (ScanType):
 *   type1 = FULL    : 7×5 전체 그리드 (기본, 가장 상세)
 *   type2 = COLUMN  : 열별 최근접 블록 (수평 스윕)
 *   type3 = NEAREST : 전체 최근접 블록 1개 (위험 감지)
 */
public class SoundScapePlugin extends JavaPlugin {

    private BlockScanner scanner;
    private SpatialAudioEngine audioEngine;

    // 활성화된 플레이어 UUID 집합 (thread-safe)
    private final Set<UUID> enabledPlayers = Collections.synchronizedSet(new HashSet<>());

    // 플레이어별 청각화 모드 (기본값: FULL)
    private final Map<UUID, ScanType> playerTypes = new ConcurrentHashMap<>();

    @Override
    public void onEnable() {
        saveDefaultConfig();

        scanner = new BlockScanner(this);
        audioEngine = new SpatialAudioEngine(this);

        getServer().getPluginManager().registerEvents(new PlayerListener(this), this);

        SoundScapeCommand cmd = new SoundScapeCommand(this);
        getCommand("soundscape").setExecutor(cmd);
        getCommand("soundscape").setTabCompleter(cmd);

        startScanLoop();

        getLogger().info("SoundScape 플러그인이 활성화되었습니다.");
        getLogger().info("  /ss toggle 로 ON/OFF  |  /ss type1~3 으로 모드 전환");
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

                    ScanType type = getPlayerType(player);
                    double[][] depthGrid = scanner.scan(player);
                    audioEngine.play(player, depthGrid, type);
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

    /** 플레이어의 현재 청각화 모드 반환 (기본값: FULL) */
    public ScanType getPlayerType(Player player) {
        return playerTypes.getOrDefault(player.getUniqueId(), ScanType.FULL);
    }

    /** 플레이어의 청각화 모드 설정 */
    public void setPlayerType(Player player, ScanType type) {
        playerTypes.put(player.getUniqueId(), type);
    }

    public Set<UUID> getEnabledPlayers() { return enabledPlayers; }
    public BlockScanner getScanner() { return scanner; }
    public SpatialAudioEngine getAudioEngine() { return audioEngine; }
}
