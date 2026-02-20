// ── 바둑판 Canvas 렌더러 ────────────────────────────────────────────────
const BOARD_SIZE = 19;
const CELL = 28;
const MARGIN = 30;
const CANVAS_SIZE = MARGIN * 2 + CELL * (BOARD_SIZE - 1);

// 좌표 → 화면 픽셀
function boardToCanvas(x, y) {
  return [MARGIN + x * CELL, MARGIN + y * CELL];
}

// 화면 픽셀 → 보드 좌표
function canvasToBoard(px, py) {
  const x = Math.round((px - MARGIN) / CELL);
  const y = Math.round((py - MARGIN) / CELL);
  if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return null;
  return { x, y };
}

// 열 레이블 (A~T, I 제외)
const COL_LABELS = 'ABCDEFGHJKLMNOPQRST';

function drawBoard(canvas, board, voteCounts = [], hoverCell = null, myVote = null) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  canvas.width  = CANVAS_SIZE * dpr;
  canvas.height = CANVAS_SIZE * dpr;
  canvas.style.width  = CANVAS_SIZE + 'px';
  canvas.style.height = CANVAS_SIZE + 'px';
  ctx.scale(dpr, dpr);

  // 바둑판 배경
  ctx.fillStyle = '#dcb468';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // 격자선
  ctx.strokeStyle = '#8B6914';
  ctx.lineWidth = 0.8;
  for (let i = 0; i < BOARD_SIZE; i++) {
    const [x0, y0] = boardToCanvas(i, 0);
    const [x1, y1] = boardToCanvas(i, BOARD_SIZE - 1);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    const [ax, ay] = boardToCanvas(0, i);
    const [bx, by] = boardToCanvas(BOARD_SIZE - 1, i);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  }

  // 화점 (별점)
  const starPoints = [3,9,15];
  ctx.fillStyle = '#8B6914';
  for (const sx of starPoints) {
    for (const sy of starPoints) {
      const [px, py] = boardToCanvas(sx, sy);
      ctx.beginPath();
      ctx.arc(px, py, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 좌표 레이블
  ctx.fillStyle = '#5a3e00';
  ctx.font = `${10}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < BOARD_SIZE; i++) {
    const [cx] = boardToCanvas(i, 0);
    ctx.fillText(COL_LABELS[i], cx, MARGIN - 16);
    ctx.fillText(COL_LABELS[i], cx, CANVAS_SIZE - MARGIN + 16);
    const [, cy] = boardToCanvas(0, i);
    ctx.fillText(String(BOARD_SIZE - i), MARGIN - 16, cy);
    ctx.fillText(String(BOARD_SIZE - i), CANVAS_SIZE - MARGIN + 16, cy);
  }

  // 투표 히트맵 오버레이
  if (voteCounts.length > 0) {
    const maxVote = voteCounts[0]?.count || 1;
    for (const v of voteCounts) {
      if (v.x === null || v.y === null) continue;
      const [px, py] = boardToCanvas(v.x, v.y);
      const alpha = 0.1 + 0.5 * (v.count / maxVote);
      ctx.fillStyle = `rgba(233,69,96,${alpha})`;
      ctx.beginPath();
      ctx.arc(px, py, CELL / 2 - 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 내 투표 표시
  if (myVote && myVote.x !== null) {
    const [px, py] = boardToCanvas(myVote.x, myVote.y);
    ctx.strokeStyle = '#f5a623';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, CELL / 2 - 3, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 돌 그리기
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const stone = board[y * BOARD_SIZE + x];
      if (!stone) continue;
      const [px, py] = boardToCanvas(x, y);
      const r = CELL / 2 - 1;

      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);

      if (stone === 1) { // 흑
        const g = ctx.createRadialGradient(px - r*0.3, py - r*0.3, r*0.1, px, py, r);
        g.addColorStop(0, '#555');
        g.addColorStop(1, '#000');
        ctx.fillStyle = g;
      } else { // 백
        const g = ctx.createRadialGradient(px - r*0.3, py - r*0.3, r*0.1, px, py, r);
        g.addColorStop(0, '#fff');
        g.addColorStop(1, '#ccc');
        ctx.fillStyle = g;
      }
      ctx.fill();
      ctx.strokeStyle = stone === 1 ? '#000' : '#aaa';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  }

  // 마지막 착수 표시
  if (board._lastMove) {
    const { x, y, color } = board._lastMove;
    const [px, py] = boardToCanvas(x, y);
    ctx.strokeStyle = color === 1 ? '#fff' : '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 호버 미리보기
  if (hoverCell && board[hoverCell.y * BOARD_SIZE + hoverCell.x] === 0) {
    const [px, py] = boardToCanvas(hoverCell.x, hoverCell.y);
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#e94560';
    ctx.beginPath();
    ctx.arc(px, py, CELL / 2 - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// ── 앱 상태 ──────────────────────────────────────────────────────────────
const state = {
  page: 'games',
  games: [],
  selectedGameId: null,
  gameStates: {},      // gameId → gameState
  myCountry: null,
  myVotes: {},         // gameId → {x, y}
  ws: null,
  timers: {},
};

// ── WebSocket ─────────────────────────────────────────────────────────────
function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}`);

  ws.onopen = () => {
    state.ws = ws;
    if (state.selectedGameId) subscribeGame(state.selectedGameId);
  };

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'update' && msg.state) {
        state.gameStates[msg.gameId] = msg.state;
        if (state.selectedGameId === msg.gameId) renderGameDetail(msg.gameId);
        renderGameCards();
      }
      if (msg.type === 'standings') renderStandings(msg.standings);
    } catch {}
  };

  ws.onclose = () => { state.ws = null; setTimeout(connectWS, 3000); };
  ws.onerror = () => ws.close();
}

function subscribeGame(gameId) {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ type: 'subscribe', gameId }));
  }
}

// ── API ───────────────────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const countryParam = new URLSearchParams(location.search).get('country');
  const url = countryParam ? `${path}${path.includes('?') ? '&' : '?'}country=${countryParam}` : path;
  const res = await fetch(url, opts);
  return res.json();
}

async function fetchMyCountry() {
  const data = await api('/api/me');
  state.myCountry = data.countryCode;
  const el = document.getElementById('my-country');
  if (state.myCountry) {
    el.innerHTML = `내 팀: <span>${COUNTRY_INFO[state.myCountry]?.flag || ''} ${COUNTRY_INFO[state.myCountry]?.name || state.myCountry}</span>`;
  } else {
    el.textContent = '(한/중/일 IP만 투표 가능)';
  }
}

async function fetchGames() {
  const games = await api('/api/games');
  state.games = games;
  for (const g of games) {
    const gs = await api(`/api/games/${g.id}`);
    state.gameStates[g.id] = gs;
  }
}

// ── 국가 정보 ─────────────────────────────────────────────────────────────
const COUNTRY_INFO = {
  KR: { name: '한국', flag: '🇰🇷' },
  CN: { name: '중국', flag: '🇨🇳' },
  JP: { name: '일본', flag: '🇯🇵' },
};

// ── 렌더링 ────────────────────────────────────────────────────────────────
function renderPage() {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === state.page));
  const app = document.getElementById('app');

  if (state.page === 'games') renderGamesPage(app);
  else if (state.page === 'standings') renderStandingsPage(app);
  else if (state.page === 'history') renderHistoryPage(app);
}

// ── 대국 현황 페이지 ──────────────────────────────────────────────────────
function renderGamesPage(app) {
  app.innerHTML = `
    <div class="games-grid" id="games-grid"></div>
    <div id="game-detail"></div>
  `;
  renderGameCards();
  if (state.selectedGameId) renderGameDetail(state.selectedGameId);
}

function renderGameCards() {
  const grid = document.getElementById('games-grid');
  if (!grid) return;
  grid.innerHTML = state.games.map(g => {
    const gs = state.gameStates[g.id];
    const black = gs?.black || {};
    const white = gs?.white || {};
    const isSelected = state.selectedGameId === g.id;
    const turnCode = g.current_turn === 'black' ? g.black_code : g.white_code;
    const turnInfo = COUNTRY_INFO[turnCode] || {};
    const nextAt = new Date(g.next_move_at);
    const remaining = Math.max(0, nextAt - Date.now());
    const mm = String(Math.floor(remaining / 60000)).padStart(2, '0');
    const ss = String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0');

    return `
      <div class="game-card${isSelected ? ' selected' : ''}" data-id="${g.id}">
        <div class="game-card-header">
          <div class="matchup">
            <div class="country">
              <span class="flag">${black.flag || ''}</span>
              <span class="cname">${black.name || g.black_code} (흑)</span>
              <span class="elo">${black.elo || 1500}</span>
            </div>
            <span class="vs">vs</span>
            <div class="country">
              <span class="flag">${white.flag || ''}</span>
              <span class="cname">${white.name || g.white_code} (백)</span>
              <span class="elo">${white.elo || 1500}</span>
            </div>
          </div>
          <span class="turn-badge">${turnInfo.flag || ''} ${turnInfo.name || ''} 차례</span>
        </div>
        <div style="padding:10px 16px;font-size:0.8rem;color:var(--text-dim);display:flex;justify-content:space-between">
          <span>제${g.move_number}수</span>
          <span>다음 착수: <b style="color:var(--gold)">${mm}:${ss}</b></span>
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.game-card').forEach(card => {
    card.addEventListener('click', () => {
      state.selectedGameId = Number(card.dataset.id);
      subscribeGame(state.selectedGameId);
      renderGameCards();
      renderGameDetail(state.selectedGameId);
      document.getElementById('game-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

function renderGameDetail(gameId) {
  const detail = document.getElementById('game-detail');
  if (!detail) return;
  const gs = state.gameStates[gameId];
  if (!gs) return;

  detail.className = 'visible';
  const { game, black, white, board, voteCounts, h2h } = gs;

  // 상대전적 계산
  const [cA, cB] = [game.black_code, game.white_code].sort();
  let h2hBlack = 0, h2hDraw = 0, h2hWhite = 0;
  if (h2h) {
    if (game.black_code === cA) {
      h2hBlack = h2h.wins_a; h2hWhite = h2h.wins_b;
    } else {
      h2hBlack = h2h.wins_b; h2hWhite = h2h.wins_a;
    }
    h2hDraw = h2h.draws;
  }

  const maxVote = voteCounts[0]?.count || 1;
  const topVotes = voteCounts.slice(0, 5);
  const myVote = state.myVotes[gameId];
  const turnCode = game.current_turn === 'black' ? game.black_code : game.white_code;
  const isMyTurn = state.myCountry && state.myCountry === turnCode;

  detail.innerHTML = `
    <hr style="border-color:var(--bg3);margin-bottom:20px">
    <div class="detail-layout">
      <div class="board-wrap">
        <div class="timer-bar">
          <div class="turn-info">
            현재 차례: <span>${COUNTRY_INFO[turnCode]?.flag} ${COUNTRY_INFO[turnCode]?.name} (${game.current_turn === 'black' ? '흑' : '백'})</span>
          </div>
          <div class="countdown" id="detail-countdown">--:--</div>
        </div>
        <canvas id="go-board"></canvas>
        <div style="font-size:0.8rem;color:var(--text-dim);text-align:center">
          클릭하여 투표 · ${isMyTurn ? '<span style="color:var(--gold)">투표 가능!</span>' : '상대 팀 차례입니다'}
        </div>
      </div>

      <div class="sidebar">
        <!-- 상대전적 -->
        <div class="panel">
          <h3>상대전적</h3>
          <div class="h2h-row">
            <span>${black.flag} ${black.name}</span>
            <span class="h2h-score">${h2hBlack} - ${h2hDraw} - ${h2hWhite}</span>
            <span>${white.flag} ${white.name}</span>
          </div>
          <div style="font-size:0.75rem;color:var(--text-dim);text-align:center">승 - 무 - 패</div>
        </div>

        <!-- 기보/포로 -->
        <div class="panel">
          <h3>현황</h3>
          <div class="score-row">
            <span><span class="stone-black"></span>${black.name} (흑)</span>
            <span>포로 ${game.prisoners_black}개</span>
          </div>
          <div class="score-row">
            <span><span class="stone-white"></span>${white.name} (백)</span>
            <span>포로 ${game.prisoners_white}개</span>
          </div>
          <div class="score-row" style="margin-top:6px;padding-top:6px;border-top:1px solid var(--bg3)">
            <span style="color:var(--text-dim)">총 수</span>
            <span>${game.move_number}수</span>
          </div>
        </div>

        <!-- 투표 현황 -->
        <div class="panel">
          <h3>투표 현황 (${voteCounts.length}곳)</h3>
          <div class="vote-list">
            ${topVotes.length === 0
              ? '<div style="color:var(--text-dim);font-size:0.85rem">아직 투표 없음</div>'
              : topVotes.map(v => {
                  const coord = v.x !== null
                    ? `${COL_LABELS[v.x]}${BOARD_SIZE - v.y}`
                    : 'PASS';
                  const pct = Math.round(100 * v.count / maxVote);
                  return `
                    <div class="vote-item">
                      <span class="vote-coord">${coord}</span>
                      <div class="vote-bar-wrap">
                        <div class="vote-bar" style="width:${pct}%"></div>
                      </div>
                      <span class="vote-count">${v.count}</span>
                    </div>
                  `;
                }).join('')
            }
          </div>
          ${isMyTurn ? `
            <div style="margin-top:10px">
              <button class="btn-pass" id="btn-pass">패스 투표</button>
              <div class="my-vote-info" id="my-vote-info">
                ${myVote ? (myVote.x !== null ? `내 투표: ${COL_LABELS[myVote.x]}${BOARD_SIZE - myVote.y}` : '내 투표: PASS') : ''}
              </div>
            </div>
          ` : ''}
        </div>

        <!-- ELO -->
        <div class="panel">
          <h3>ELO 레이팅</h3>
          <div class="score-row">
            <span>${black.flag} ${black.name}</span>
            <span style="color:var(--accent);font-weight:bold">${black.elo}</span>
          </div>
          <div class="score-row">
            <span>${white.flag} ${white.name}</span>
            <span style="color:var(--accent);font-weight:bold">${white.elo}</span>
          </div>
        </div>
      </div>
    </div>
  `;

  // 바둑판 그리기
  const canvas = document.getElementById('go-board');
  board._lastMove = gs.recentMoves?.[0]
    ? { x: gs.recentMoves[0].x, y: gs.recentMoves[0].y, color: gs.recentMoves[0].color === 'black' ? 1 : 2 }
    : null;
  drawBoard(canvas, board, voteCounts, null, myVote);

  // 캔버스 클릭 투표
  canvas.addEventListener('click', async (e) => {
    if (!isMyTurn) { showToast('현재 상대 팀 차례입니다.'); return; }
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / (canvas.style.width ? parseFloat(canvas.style.width) : canvas.width);
    const scaleY = canvas.height / (canvas.style.height ? parseFloat(canvas.style.height) : canvas.height);
    const dpr = window.devicePixelRatio || 1;
    const px = (e.clientX - rect.left) * (dpr * rect.width / canvas.width);
    const py = (e.clientY - rect.top)  * (dpr * rect.height / canvas.height);
    const cell = canvasToBoard(px / dpr, py / dpr);
    if (!cell) return;
    await submitVote(gameId, cell.x, cell.y);
  });

  // 호버 효과
  canvas.addEventListener('mousemove', (e) => {
    if (!isMyTurn) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const px = (e.clientX - rect.left) * (dpr * rect.width / canvas.width);
    const py = (e.clientY - rect.top)  * (dpr * rect.height / canvas.height);
    const cell = canvasToBoard(px / dpr, py / dpr);
    drawBoard(canvas, board, voteCounts, cell, myVote);
  });
  canvas.addEventListener('mouseleave', () => drawBoard(canvas, board, voteCounts, null, myVote));

  // 패스 버튼
  document.getElementById('btn-pass')?.addEventListener('click', () => submitVote(gameId, null, null));

  // 카운트다운 타이머
  startDetailTimer(gameId, game.next_move_at);
}

async function submitVote(gameId, x, y) {
  try {
    const countryParam = new URLSearchParams(location.search).get('country');
    const url = `/api/games/${gameId}/vote${countryParam ? `?country=${countryParam}` : ''}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x, y }),
    });
    const data = await res.json();
    if (data.ok) {
      state.myVotes[gameId] = { x, y };
      const coord = x !== null ? `${COL_LABELS[x]}${BOARD_SIZE - y}` : 'PASS';
      showToast(`투표 완료: ${coord}`);
      const info = document.getElementById('my-vote-info');
      if (info) info.textContent = `내 투표: ${coord}`;
      // 보드 재그리기
      const gs = state.gameStates[gameId];
      if (gs) {
        const canvas = document.getElementById('go-board');
        drawBoard(canvas, gs.board, gs.voteCounts, null, { x, y });
      }
    } else {
      showToast(data.error || '투표 실패');
    }
  } catch {
    showToast('네트워크 오류');
  }
}

// ── 타이머 ────────────────────────────────────────────────────────────────
const COL_LABELS = 'ABCDEFGHJKLMNOPQRST';

function startDetailTimer(gameId, nextMoveAt) {
  clearInterval(state.timers['detail']);
  state.timers['detail'] = setInterval(() => {
    const el = document.getElementById('detail-countdown');
    if (!el) { clearInterval(state.timers['detail']); return; }
    const remaining = Math.max(0, new Date(nextMoveAt) - Date.now());
    const mm = String(Math.floor(remaining / 60000)).padStart(2, '0');
    const ss = String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0');
    el.textContent = `${mm}:${ss}`;
    if (remaining <= 30000) el.style.color = '#e94560';
    else el.style.color = 'var(--gold)';
  }, 1000);
}

// ── 순위표 페이지 ─────────────────────────────────────────────────────────
async function renderStandingsPage(app) {
  const [standings, h2hList] = await Promise.all([
    api('/api/standings'),
    api('/api/h2h'),
  ]);

  const rankIcon = ['🥇', '🥈', '🥉'];
  app.innerHTML = `
    <div class="standings-wrap">
      <h2 style="margin-bottom:16px;color:var(--gold)">🏆 ELO 순위표</h2>
      <table class="standings-table">
        <thead><tr>
          <th>순위</th><th>국가</th><th>ELO</th>
        </tr></thead>
        <tbody>
          ${standings.map((c, i) => `
            <tr>
              <td class="rank">${rankIcon[i] || i + 1}</td>
              <td>${c.flag} ${c.name}</td>
              <td class="elo-val">${c.elo}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <h2 style="margin:28px 0 16px;color:var(--gold)">⚔️ 상대전적</h2>
      <table class="h2h-table">
        <thead><tr>
          <th>국가 A</th><th>전적 (승-무-패)</th><th>국가 B</th>
        </tr></thead>
        <tbody>
          ${h2hList.map(h => `
            <tr>
              <td>${h.flag_a} ${h.name_a}</td>
              <td style="text-align:center">
                <span style="color:var(--gold);font-weight:bold">${h.wins_a}</span>
                <span style="color:var(--text-dim)"> - ${h.draws} - </span>
                <span style="color:var(--accent);font-weight:bold">${h.wins_b}</span>
              </td>
              <td>${h.flag_b} ${h.name_b}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderStandings(standings) {
  if (state.page === 'standings') renderStandingsPage(document.getElementById('app'));
}

// ── 기보 히스토리 페이지 ──────────────────────────────────────────────────
async function renderHistoryPage(app) {
  app.innerHTML = `<div style="color:var(--text-dim);text-align:center;padding:40px">불러오는 중...</div>`;
  const history = await api('/api/history');

  if (history.length === 0) {
    app.innerHTML = `<div style="color:var(--text-dim);text-align:center;padding:40px">아직 완료된 대국이 없습니다.</div>`;
    return;
  }

  app.innerHTML = `
    <h2 style="margin-bottom:16px;color:var(--gold)">📜 기보 히스토리</h2>
    <div class="history-list">
      ${history.map(g => {
        const date = new Date(g.ended_at).toLocaleDateString('ko-KR');
        return `
          <div class="history-item">
            <div class="history-matchup">
              ${g.black_flag} ${g.black_name} (흑) vs ${g.white_flag} ${g.white_name} (백)
            </div>
            <div class="history-winner">
              ${g.winner_name ? `🏆 ${g.winner_name} 승` : '무승부'}
            </div>
            <div class="history-date">${date} · ${g.move_number}수</div>
            <button class="btn-sgf" onclick="downloadSGF(${g.id})">SGF 다운로드</button>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function downloadSGF(gameId) {
  const a = document.createElement('a');
  a.href = `/api/games/${gameId}/sgf`;
  a.download = `game_${gameId}.sgf`;
  a.click();
}

// ── 토스트 ────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

// ── 초기화 ────────────────────────────────────────────────────────────────
async function init() {
  // 네비게이션
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      state.page = btn.dataset.page;
      const app = document.getElementById('app');
      if (state.page === 'standings') await renderStandingsPage(app);
      else if (state.page === 'history') await renderHistoryPage(app);
      else renderPage();
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === state.page));
    });
  });

  await fetchMyCountry();
  await fetchGames();
  renderPage();
  connectWS();

  // 카드 타이머 갱신 (1초)
  setInterval(renderGameCards, 1000);
}

init();
