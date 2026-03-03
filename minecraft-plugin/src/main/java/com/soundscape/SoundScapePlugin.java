package com.soundscape;

import com.soundscape.audio.ScanType;
import com.soundscape.audio.SpatialAudioEngine;
import com.soundscape.command.SoundScapeCommand;
import com.soundscape.entity.EntityHit;
import com.soundscape.entity.EntityScanner;
import com.soundscape.listener.PlayerListener;
import com.soundscape.scanner.BlockScanner;
import org.bukkit.entity.Player;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitRunnable;

import java.util.Collections;
import java.util.HashSet;
import java.util.List;
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
 * 청각화 모드 (ScanType):
 *   type1 = FULL    : 7×5 전체 그리드 (기본, 가장 상세)
 *   type2 = COLUMN  : 열별 최근접 블록 (수평 스윕)
 *   type3 = NEAREST : 전체 최근접 블록 1개 (위험 감지)
 *
 * 지면 필터:
 *   player.isOnGround() 일 때 발 Y를 playerGroundY에 저장.
 *   점프 중에는 마지막 서 있던 Y를 유지.
 *   그 기준 Y + FLOOR_TOLERANCE 이하로 히트하는 레이는 바닥으로 판단해 무음 처리.
 */
public class SoundScapePlugin extends JavaPlugin {

    private BlockScanner scanner;
    private SpatialAudioEngine audioEngine;
    private EntityScanner entityScanner;

    private final Set<UUID> enabledPlayers = Collections.synchronizedSet(new HashSet<>());
    private final Map<UUID, ScanType> playerTypes  = new ConcurrentHashMap<>();
    /** 마지막으로 땅에 서 있던 발 Y (점프 중에도 이 값 유지) */
    private final Map<UUID, Double>   playerGroundY = new ConcurrentHashMap<>();

    @Override
    public void onEnable() {
        saveDefaultConfig();

        scanner       = new BlockScanner(this);
        audioEngine   = new SpatialAudioEngine(this);
        entityScanner = new EntityScanner(this);

        getServer().getPluginManager().registerEvents(new PlayerListener(this), this);

        SoundScapeCommand cmd = new SoundScapeCommand(this);
        getCommand("soundscape").setExecutor(cmd);
        getCommand("soundscape").setTabCompleter(cmd);

        startScanLoop();

        getLogger().info("SoundScape 플러그인이 활성화되었습니다.");
        getLogger().info("  /ss toggle | /ss type1~3 | /ss range");
    }

    @Override
    public void onDisable() {
        getLogger().info("SoundScape 플러그인이 비활성화되었습니다.");
    }

    // ── 스캔 루프 ──────────────────────────────────────────────

    private void startScanLoop() {
        double intervalSec  = getConfig().getDouble("update_interval_seconds", 0.2);
        long   intervalTicks = Math.max(1L, Math.round(intervalSec * 20.0));

        new BukkitRunnable() {
            @Override
            public void run() {
                for (Player player : getServer().getOnlinePlayers()) {
                    if (!enabledPlayers.contains(player.getUniqueId())) continue;

                    // 지면 Y 갱신: 땅에 있으면 현재 Y 기록, 점프 중이면 마지막 값 유지
                    double groundY = updateGroundY(player);

                    ScanType type = getPlayerType(player);

                    // 블록 스캔 + 바닥 필터 적용
                    double[][] depthGrid = scanner.scan(player);
                    audioEngine.play(player, depthGrid, type, groundY);

                    // 엔티티 스캔 (블록과 독립적으로 항상 실행)
                    List<EntityHit> entityHits = entityScanner.scan(player);
                    audioEngine.playEntities(player, entityHits);
                }
            }
        }.runTaskTimer(this, 20L, intervalTicks);
    }

    // ── 지면 Y 추적 ──────────────────────────────────────────────

    /**
     * 플레이어가 땅 위에 있으면 현재 발 Y를 기록하고 반환.
     * 공중에 있으면 마지막으로 서 있던 Y를 반환 (점프 기준 유지).
     */
    private double updateGroundY(Player player) {
        UUID uid = player.getUniqueId();
        if (player.isOnGround()) {
            double y = player.getLocation().getY();
            playerGroundY.put(uid, y);
            return y;
        }
        // 점프 중 또는 낙하 중: 마지막 지면 Y 반환
        // 기록이 없으면 현재 Y로 초기화 (처음 활성화할 때)
        return playerGroundY.getOrDefault(uid, player.getLocation().getY());
    }

    // ── 공개 API ──────────────────────────────────────────────

    public boolean isEnabled(Player player) {
        return enabledPlayers.contains(player.getUniqueId());
    }

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

    public ScanType getPlayerType(Player player) {
        return playerTypes.getOrDefault(player.getUniqueId(), ScanType.FULL);
    }

    public void setPlayerType(Player player, ScanType type) {
        playerTypes.put(player.getUniqueId(), type);
    }

    /**
     * 플레이어 퇴장 시 모든 상태 정리 (메모리 누수 방지).
     * PlayerListener.onPlayerQuit()에서 호출.
     */
    public void cleanupPlayer(UUID uid) {
        enabledPlayers.remove(uid);
        playerTypes.remove(uid);
        playerGroundY.remove(uid);
    }

    public Set<UUID> getEnabledPlayers() { return enabledPlayers; }
    public BlockScanner getScanner()     { return scanner; }
    public SpatialAudioEngine getAudioEngine() { return audioEngine; }
}
