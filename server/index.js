const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cron = require('node-cron');
const path = require('path');
const db = require('./db');
const { countryMiddleware } = require('./geoip');
const {
  initLeagueGames,
  processDueTurns,
  getGameState,
  getStandings,
  getActiveGames,
  getGameHistory,
} = require('./gameManager');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
app.use(countryMiddleware);

// ── WebSocket ─────────────────────────────────────────────────────────────
const clients = new Map(); // ws → { gameId, countryCode }

wss.on('connection', (ws, req) => {
  clients.set(ws, { gameId: null, countryCode: null });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'subscribe' && msg.gameId) {
        const meta = clients.get(ws);
        meta.gameId = msg.gameId;
      }
    } catch {}
  });

  ws.on('close', () => clients.delete(ws));
});

function broadcast(gameId, payload) {
  const data = JSON.stringify({ type: 'update', gameId, ...payload });
  for (const [ws, meta] of clients) {
    if (ws.readyState === WebSocket.OPEN && meta.gameId === gameId) {
      ws.send(data);
    }
  }
}

function broadcastAll(payload) {
  const data = JSON.stringify(payload);
  for (const [ws] of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  }
}

// ── 10분 cron ─────────────────────────────────────────────────────────────
// 매 10분마다 실행 (0,10,20,30,40,50분)
cron.schedule('*/10 * * * *', () => {
  console.log('[Cron] 착수 처리 시작:', new Date().toISOString());
  processDueTurns((gameId, result) => {
    const state = getGameState(gameId);
    if (state) broadcast(gameId, { state });
  });
  broadcastAll({ type: 'standings', standings: getStandings() });
});

// ── REST API ──────────────────────────────────────────────────────────────

// 내 국가 확인
app.get('/api/me', (req, res) => {
  res.json({ countryCode: req.countryCode });
});

// 활성 게임 목록
app.get('/api/games', (req, res) => {
  const games = getActiveGames();
  res.json(games);
});

// 게임 상태 조회
app.get('/api/games/:id', (req, res) => {
  const state = getGameState(Number(req.params.id));
  if (!state) return res.status(404).json({ error: '게임 없음' });
  res.json(state);
});

// 투표 제출
app.post('/api/games/:id/vote', async (req, res) => {
  const gameId = Number(req.params.id);
  const { x, y } = req.body; // x,y = null 이면 pass
  const countryCode = req.countryCode;

  if (!countryCode) {
    return res.status(403).json({ error: '한국, 중국, 일본 IP만 투표 가능합니다.' });
  }

  const game = db.prepare(`SELECT * FROM games WHERE id = ? AND status = 'active'`).get(gameId);
  if (!game) return res.status(404).json({ error: '활성 게임 없음' });

  // 투표 국가가 현재 턴 국가인지 확인
  const turnCountry = game.current_turn === 'black' ? game.black_code : game.white_code;
  if (countryCode !== turnCountry) {
    return res.status(403).json({ error: `현재 ${turnCountry}의 차례입니다.` });
  }

  // 좌표 유효성
  if (x !== null && y !== null) {
    if (x < 0 || x >= 19 || y < 0 || y >= 19) {
      return res.status(400).json({ error: '잘못된 좌표' });
    }
  }

  const ip = req.clientIP || req.socket.remoteAddress;

  try {
    db.prepare(`
      INSERT OR REPLACE INTO votes (game_id, move_number, ip, country_code, x, y)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(gameId, game.move_number, ip, countryCode, x ?? null, y ?? null);

    // 실시간 투표 현황 브로드캐스트
    const state = getGameState(gameId);
    broadcast(gameId, { state });

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 순위표
app.get('/api/standings', (req, res) => {
  res.json(getStandings());
});

// 상대전적
app.get('/api/h2h', (req, res) => {
  const h2h = db.prepare(`
    SELECT h.*,
           ca.name as name_a, ca.flag as flag_a,
           cb.name as name_b, cb.flag as flag_b
    FROM head_to_head h
    JOIN countries ca ON h.country_a = ca.code
    JOIN countries cb ON h.country_b = cb.code
  `).all();
  res.json(h2h);
});

// 기보 히스토리
app.get('/api/history', (req, res) => {
  const page = Number(req.query.page) || 0;
  res.json(getGameHistory(20, page * 20));
});

// SGF 다운로드
app.get('/api/games/:id/sgf', (req, res) => {
  const game = db.prepare(`SELECT * FROM games WHERE id = ?`).get(Number(req.params.id));
  if (!game) return res.status(404).end();
  const sgf = `(;GM[1]FF[4]SZ[19]KM[6.5]PB[${game.black_code}]PW[${game.white_code}]${game.sgf})`;
  res.setHeader('Content-Type', 'application/x-go-sgf');
  res.setHeader('Content-Disposition', `attachment; filename="game_${game.id}.sgf"`);
  res.send(sgf);
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ── 시작 ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[Server] http://localhost:${PORT}`);
  initLeagueGames();
});
