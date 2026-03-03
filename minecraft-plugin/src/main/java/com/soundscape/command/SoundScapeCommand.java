package com.soundscape.command;

import com.soundscape.SoundScapePlugin;
import com.soundscape.audio.ScanType;
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
 *   /ss toggle          - SoundScape ON/OFF
 *   /ss type1           - [Type 1] FULL    — 7×5 전체 격자 (기본·상세)
 *   /ss type2           - [Type 2] COLUMN  — 열별 최근접 블록 (수평 스윕)
 *   /ss type3           - [Type 3] NEAREST — 전체 최근접 1개 (위험 감지)
 *   /ss range <블록>    - 탐지 거리 변경 (1~30)
 *   /ss help            - 도움말
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
            case "toggle"  -> handleToggle(player);
            case "type1"   -> handleType(player, ScanType.FULL);
            case "type2"   -> handleType(player, ScanType.COLUMN);
            case "type3"   -> handleType(player, ScanType.NEAREST);
            case "range"   -> handleRange(player, args);
            default        -> sendHelp(player);
        }

        return true;
    }

    // ── 서브 명령 핸들러 ──────────────────────────────────────

    private void handleToggle(Player player) {
        boolean nowEnabled = plugin.toggle(player);
        if (nowEnabled) {
            ScanType type = plugin.getPlayerType(player);
            player.sendMessage(PREFIX + ChatColor.GREEN + "공간 청각화 활성화됨.");
            player.sendMessage(ChatColor.GRAY + "  모드: " + typeTag(type)
                    + ChatColor.GRAY + "  (/ss type1~3 으로 변경)");
            player.sendMessage(ChatColor.GRAY + "  탐지 범위: "
                    + plugin.getConfig().getDouble("max_distance", 12.0) + " 블록");
        } else {
            player.sendMessage(PREFIX + ChatColor.YELLOW + "공간 청각화 비활성화됨.");
        }
    }

    private void handleType(Player player, ScanType type) {
        plugin.setPlayerType(player, type);

        String colorStr;
        String tip;
        switch (type) {
            case FULL    -> { colorStr = ChatColor.GREEN.toString();
                              tip = "7×5 격자 전체 — 가장 상세한 공간 인식"; }
            case COLUMN  -> { colorStr = ChatColor.YELLOW.toString();
                              tip = "열(7방향)별 최근접 — 수평 장애물 파악 특화"; }
            case NEAREST -> { colorStr = ChatColor.RED.toString();
                              tip = "전체 최근접 블록 1개 — 즉각적인 위험 방향·거리 전달"; }
            default      -> { colorStr = ChatColor.WHITE.toString();
                              tip = ""; }
        }

        player.sendMessage(PREFIX + "모드 변경: "
                + colorStr + "[Type " + type.id + "] " + type.displayName);
        player.sendMessage(ChatColor.GRAY + "  " + tip);

        if (!plugin.isEnabled(player)) {
            player.sendMessage(ChatColor.GRAY + "  ※ 현재 OFF 상태 — /ss toggle 로 활성화하세요.");
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
        ScanType current = plugin.getPlayerType(player);
        boolean on = plugin.isEnabled(player);

        player.sendMessage(ChatColor.AQUA + "══════ SoundScape 도움말 ══════");
        player.sendMessage(ChatColor.WHITE + "/ss toggle"
                + ChatColor.GRAY + "  —  ON/OFF  (현재: "
                + (on ? ChatColor.GREEN + "ON" : ChatColor.RED + "OFF") + ChatColor.GRAY + ")");
        player.sendMessage("");
        player.sendMessage(ChatColor.YELLOW + "청각화 모드 전환  (현재: " + typeTag(current) + ChatColor.YELLOW + ")");
        player.sendMessage(ChatColor.WHITE + "/ss type1"
                + ChatColor.GRAY + "  →  " + ChatColor.GREEN + "[Type 1] FULL"
                + ChatColor.GRAY + "   7×5 전체 (기본·상세)");
        player.sendMessage(ChatColor.WHITE + "/ss type2"
                + ChatColor.GRAY + "  →  " + ChatColor.YELLOW + "[Type 2] COLUMN"
                + ChatColor.GRAY + " 열별 최근접 (수평 스윕)");
        player.sendMessage(ChatColor.WHITE + "/ss type3"
                + ChatColor.GRAY + "  →  " + ChatColor.RED + "[Type 3] NEAREST"
                + ChatColor.GRAY + " 가장 가까운 1개 (위험 감지)");
        player.sendMessage("");
        player.sendMessage(ChatColor.WHITE + "/ss range <블록>"
                + ChatColor.GRAY + "  —  탐지 거리 설정 (1~30)");
        player.sendMessage(ChatColor.WHITE + "/ss help"
                + ChatColor.GRAY + "  —  이 도움말");
        player.sendMessage(ChatColor.DARK_GRAY
                + "소리 높낮이=높이, 좌우=방향, 크기=거리");
    }

    // ── 탭 자동완성 ───────────────────────────────────────────

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        if (args.length == 1) {
            return Arrays.asList("toggle", "type1", "type2", "type3", "range", "help").stream()
                    .filter(s -> s.startsWith(args[0].toLowerCase()))
                    .collect(Collectors.toList());
        }
        if (args.length == 2 && args[0].equalsIgnoreCase("range")) {
            return Arrays.asList("5", "10", "15", "20");
        }
        return List.of();
    }

    // ── 내부 유틸리티 ─────────────────────────────────────────

    private String typeTag(ScanType type) {
        return switch (type) {
            case FULL    -> ChatColor.GREEN  + "[Type 1] FULL";
            case COLUMN  -> ChatColor.YELLOW + "[Type 2] COLUMN";
            case NEAREST -> ChatColor.RED    + "[Type 3] NEAREST";
        };
    }
}
