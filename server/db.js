const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/baduk.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS countries (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    flag TEXT NOT NULL,
    elo INTEGER NOT NULL DEFAULT 1500
  );

  CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    black_code TEXT NOT NULL,
    white_code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',  -- active, finished, draw
    winner_code TEXT,
    current_turn TEXT NOT NULL DEFAULT 'black',
    move_number INTEGER NOT NULL DEFAULT 0,
    board_state TEXT NOT NULL DEFAULT '',   -- JSON array 361 cells
    prev_board_state TEXT,                  -- Ko 체크용: 2수 전 보드
    prisoners_black INTEGER NOT NULL DEFAULT 0,
    prisoners_white INTEGER NOT NULL DEFAULT 0,
    next_move_at TEXT NOT NULL,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at TEXT,
    sgf TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (black_code) REFERENCES countries(code),
    FOREIGN KEY (white_code) REFERENCES countries(code)
  );

  CREATE TABLE IF NOT EXISTS moves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL,
    move_number INTEGER NOT NULL,
    x INTEGER,          -- NULL = pass
    y INTEGER,          -- NULL = pass
    color TEXT NOT NULL,
    vote_count INTEGER NOT NULL DEFAULT 0,
    played_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (game_id) REFERENCES games(id)
  );

  CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL,
    move_number INTEGER NOT NULL,
    ip TEXT NOT NULL,
    country_code TEXT NOT NULL,
    x INTEGER,
    y INTEGER,
    voted_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(game_id, move_number, ip),
    FOREIGN KEY (game_id) REFERENCES games(id)
  );

  CREATE TABLE IF NOT EXISTS head_to_head (
    country_a TEXT NOT NULL,
    country_b TEXT NOT NULL,
    wins_a INTEGER NOT NULL DEFAULT 0,
    wins_b INTEGER NOT NULL DEFAULT 0,
    draws INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (country_a, country_b),
    FOREIGN KEY (country_a) REFERENCES countries(code),
    FOREIGN KEY (country_b) REFERENCES countries(code)
  );
`);

// page_visits 테이블 마이그레이션
db.exec(`
  CREATE TABLE IF NOT EXISTS page_visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL,
    country_code TEXT,
    visited_at TEXT NOT NULL DEFAULT (datetime('now')),
    date TEXT NOT NULL DEFAULT (date('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_page_visits_date ON page_visits(date);
  CREATE INDEX IF NOT EXISTS idx_page_visits_ip_date ON page_visits(ip, date);
`);

// prev_board_state 컬럼 마이그레이션 (기존 DB 호환)
try {
  db.exec(`ALTER TABLE games ADD COLUMN prev_board_state TEXT`);
} catch {}

// divine_mode 컬럼 마이그레이션: 1 = 신의 한수 대기 중 (투표 1개로 즉시 착수)
try {
  db.exec(`ALTER TABLE games ADD COLUMN divine_mode INTEGER NOT NULL DEFAULT 0`);
} catch {}

// 기존 US 데이터 → WORLD 마이그레이션
try {
  db.exec(`UPDATE countries SET code = 'WORLD', name = 'World', flag = '🌍' WHERE code = 'US'`);
  db.exec(`UPDATE games SET black_code = 'WORLD' WHERE black_code = 'US'`);
  db.exec(`UPDATE games SET white_code = 'WORLD' WHERE white_code = 'US'`);
  db.exec(`UPDATE games SET winner_code = 'WORLD' WHERE winner_code = 'US'`);
  db.exec(`UPDATE votes SET country_code = 'WORLD' WHERE country_code = 'US'`);
  db.exec(`UPDATE head_to_head SET country_a = 'WORLD' WHERE country_a = 'US'`);
  db.exec(`UPDATE head_to_head SET country_b = 'WORLD' WHERE country_b = 'US'`);
} catch {}

// 초기 국가 데이터 (한중일 + 월드)
const initCountries = db.prepare(`
  INSERT OR IGNORE INTO countries (code, name, flag, elo) VALUES (?, ?, ?, 1500)
`);
initCountries.run('KR', '한국', '🇰🇷');
initCountries.run('CN', '중국', '🇨🇳');
initCountries.run('JP', '일본', '🇯🇵');
initCountries.run('WORLD', 'World', '🌍');

// 상대전적 초기화 (4팀 6쌍 - 정렬된 키 사용)
const allCodes = ['CN', 'JP', 'KR', 'WORLD'];
const initH2H = db.prepare(`
  INSERT OR IGNORE INTO head_to_head (country_a, country_b) VALUES (?, ?)
`);
for (let i = 0; i < allCodes.length; i++) {
  for (let j = i + 1; j < allCodes.length; j++) {
    initH2H.run(allCodes[i], allCodes[j]);
  }
}

module.exports = db;
