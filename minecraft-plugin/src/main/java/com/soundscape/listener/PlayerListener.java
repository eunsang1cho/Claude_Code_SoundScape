package com.soundscape.listener;

import com.soundscape.SoundScapePlugin;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerQuitEvent;

/**
 * 플레이어 이벤트 리스너
 *
 * 서버 퇴장 시 활성화 상태를 정리하여 메모리 누수를 방지합니다.
 */
public class PlayerListener implements Listener {

    private final SoundScapePlugin plugin;

    public PlayerListener(SoundScapePlugin plugin) {
        this.plugin = plugin;
    }

    @EventHandler
    public void onPlayerQuit(PlayerQuitEvent event) {
        // 퇴장한 플레이어가 SoundScape를 켜 두었다면 집합에서 제거
        plugin.getEnabledPlayers().remove(event.getPlayer().getUniqueId());
    }
}
