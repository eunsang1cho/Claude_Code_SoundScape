package com.soundscape.command;

import com.soundscape.SoundScapePlugin;
import org.bukkit.ChatColor;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;

import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

/**
 * /soundscape (alias: /ss) 명령어 처리기
 *
 *   /ss toggle        - SoundScape ON/OFF
 *   /ss range <블록>  - 탐지 거리 변경 (1~30)
 *   /ss help          - 도움말
 */
public class SoundScapeCommand implements CommandExecutor, TabCompleter {

    private final SoundScapePlugin plugin;

    private static final String PREFIX = ChatColor.AQUA + "[SoundScape] " + ChatColor.RESET;

    public SoundScapeCommand(SoundScapePlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage(PREFIX + "플레이어만 사용 가능한 명령어입니다.");
            return true;
        }

        if (!player.hasPermission("soundscape.use")) {
            player.sendMessage(PREFIX + ChatColor.RED + "권한이 없습니다.");
            return true;
        }

        if (args.length == 0 || args[0].equalsIgnoreCase("help")) {
            sendHelp(player);
            return true;
        }

        switch (args[0].toLowerCase()) {
            case "toggle" -> handleToggle(player);
            case "range"  -> handleRange(player, args);
            default       -> sendHelp(player);
        }

        return true;
    }

    // ── 서브 명령 핸들러 ──────────────────────────────────────

    private void handleToggle(Player player) {
        boolean nowEnabled = plugin.toggle(player);
        if (nowEnabled) {
            player.sendMessage(PREFIX + ChatColor.GREEN + "공간 청각화 활성화됨. " + ChatColor.GRAY
                    + "(탐지 범위: " + plugin.getConfig().getDouble("max_distance", 12.0) + " 블록)");
            player.sendMessage(ChatColor.GRAY + "  높은 소리 = 위쪽 블록, 낮은 소리 = 아래쪽 블록");
            player.sendMessage(ChatColor.GRAY + "  좌/우 소리 = 좌/우 블록, 큰 소리 = 가까운 블록");
        } else {
            player.sendMessage(PREFIX + ChatColor.YELLOW + "공간 청각화 비활성화됨.");
        }
    }

    private void handleRange(Player player, String[] args) {
        if (args.length < 2) {
            player.sendMessage(PREFIX + "사용법: /ss range <1~30>");
            return;
        }
        double range;
        try {
            range = Double.parseDouble(args[1]);
        } catch (NumberFormatException e) {
            player.sendMessage(PREFIX + ChatColor.RED + "숫자를 입력하세요. 예: /ss range 15");
            return;
        }
        range = Math.max(1.0, Math.min(30.0, range));
        plugin.getConfig().set("max_distance", range);
        plugin.saveConfig();
        player.sendMessage(PREFIX + ChatColor.GREEN + "탐지 거리를 " + range + " 블록으로 설정했습니다.");
    }

    private void sendHelp(Player player) {
        player.sendMessage(ChatColor.AQUA + "═══ SoundScape 도움말 ═══");
        player.sendMessage(ChatColor.WHITE + "/ss toggle" + ChatColor.GRAY + " - 공간 청각화 ON/OFF");
        player.sendMessage(ChatColor.WHITE + "/ss range <블록>" + ChatColor.GRAY + " - 탐지 거리 설정 (1~30)");
        player.sendMessage(ChatColor.WHITE + "/ss help" + ChatColor.GRAY + " - 이 도움말");
        player.sendMessage(ChatColor.GRAY + "현재 상태: "
                + (plugin.isEnabled(player) ? ChatColor.GREEN + "ON" : ChatColor.RED + "OFF"));
    }

    // ── 탭 자동완성 ───────────────────────────────────────────

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        if (args.length == 1) {
            return Arrays.asList("toggle", "range", "help").stream()
                    .filter(s -> s.startsWith(args[0].toLowerCase()))
                    .collect(Collectors.toList());
        }
        if (args.length == 2 && args[0].equalsIgnoreCase("range")) {
            return Arrays.asList("5", "10", "15", "20");
        }
        return List.of();
    }
}
