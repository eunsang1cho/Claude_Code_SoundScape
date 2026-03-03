package com.soundscape.listener;

import com.soundscape.SoundScapePlugin;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerQuitEvent;

/**
 * 플레이어 이벤트 리스너
 *
 * 퇴장 시 enabledPlayers, playerTypes, playerGroundY를 모두 정리.
 */
public class PlayerListener implements Listener {

    private final SoundScapePlugin plugin;

    public PlayerListener(SoundScapePlugin plugin) {
        this.plugin = plugin;
    }

    @EventHandler
    public void onPlayerQuit(PlayerQuitEvent event) {
        plugin.cleanupPlayer(event.getPlayer().getUniqueId());
    }
}
