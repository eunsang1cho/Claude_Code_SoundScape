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

      // 신의 한수 대기 모드 시작 (투표 0개로 10분 경과)
      if (msg.type === 'divine_mode_start') {
        setDivineModeActive(msg.gameId, msg.votingCountry, true);
      }

      // 신의 한수 즉시 착수 완료
      if (msg.type === 'divine_move_executed') {
        setDivineModeActive(msg.gameId, null, false);
        const info = getCountryInfo(msg.votingCountry);
        showDivineToast(T('divine_toast', info.flag, info.name, msg.coord));
      }

      if (msg.type === 'game_finished') {
        // 내가 참가 중인 게임인지 확인
        const myCode = state.myCountry;
        if (myCode && (msg.blackCode === myCode || msg.whiteCode === myCode)) {
          let type;
          if (!msg.winnerCode)           type = 'draw';
          else if (msg.winnerCode === myCode) type = 'win';
          else                           type = 'lose';

          showResultOverlay(type, myCode, msg.blackScore, msg.whiteScore, msg.blackCode, msg.whiteCode);
        }
        // 선택된 게임이면 게임 목록 갱신
        fetchGames().then(renderGameCards);
      }
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
  applyLang(); // 언어 적용
  const el = document.getElementById('my-country');
  const info = getCountryInfo(state.myCountry);
  if (state.myCountry) {
    el.innerHTML = `${T('my_team')}: <span>${info.flag} ${info.name}</span>`;
  } else {
    el.textContent = T('vote_only');
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

// ── 국가 메타 (flag/colors는 언어 무관) ───────────────────────────────────
const COUNTRY_META = {
  KR: { flag: '🇰🇷', colors: ['#C60C30', '#003478', '#ffffff'] },
  CN: { flag: '🇨🇳', colors: ['#DE2910', '#FFDE00', '#FF6B6B'] },
  JP: { flag: '🇯🇵', colors: ['#BC002D', '#ffffff', '#FF6B9D'] },
  US: { flag: '🇺🇸', colors: ['#B22234', '#3C3B6E', '#ffffff'] },
};

// ── 다국어 ─────────────────────────────────────────────────────────────────
const LANGS = {
  KR: {
    html_lang: 'ko', title: '국가대항전 바둑 🌏', footer: '국가대항전 바둑 · 10분마다 착수 · 한중일 리그전',
    nav_games: '대국 현황', nav_standings: '순위표', nav_history: '기보 히스토리',
    my_team: '내 팀', vote_only: '(한/중/일 IP만 투표 가능)',
    black: '흑', white: '백',
    move_no: n => `제${n}수`,
    divine_waiting: '⚡ 신의 한수 대기 중',
    next_move: '다음 착수', current_turn: '현재 차례',
    click_to_vote: '클릭하여 투표', can_vote: '투표 가능!', opponent_turn: '상대 팀 차례입니다',
    h2h_title: '상대전적', status_title: '현황',
    prisoners: n => `포로 ${n}개`, total_moves: '총 수',
    votes_title: n => `투표 현황 (${n}곳)`, no_votes: '아직 투표 없음',
    btn_pass: '패스 투표', my_vote: c => `내 투표: ${c}`,
    elo_rating: 'ELO 레이팅',
    vote_done: c => `투표 완료: ${c}`, vote_fail: '투표 실패',
    opponent_turn_toast: '현재 상대 팀 차례입니다.',
    divine_toast: (f, n, c) => `⚡ 신의 한수! ${f} ${n} → ${c}`,
    standings_title: '🏆 ELO 순위표', rank: '순위', country: '국가',
    h2h_section: '⚔️ 상대전적',
    h2h_col_a: '국가 A', h2h_record: '전적 (승-무-패)', h2h_col_b: '국가 B',
    history_title: '📜 기보 히스토리',
    loading: '불러오는 중...', no_history: '아직 완료된 대국이 없습니다.',
    history_winner: n => `🏆 ${n} 승`, history_draw: '무승부',
    history_moves: n => `${n}수`,
    score_line: (bf, bs, wf, ws) => `${bf}흑 ${bs}집  vs  ${wf}백 ${ws}집`,
    result_win: '승리!', result_win_sub: (f, n) => `${f} ${n}의 승리!`,
    result_lose: '패배', result_lose_sub: (f, n) => `${f} ${n} 패배...`,
    result_draw: '무승부', result_draw_sub: '무승부',
    result_close: '계속 보기', ad_area: '광고 영역',
    locale: 'ko-KR',
    names: { KR: '한국', CN: '중국', JP: '일본', US: '미국' },
  },
  CN: {
    html_lang: 'zh', title: '国家对抗围棋 🌏', footer: '国家对抗围棋 · 每10分钟落子 · 中韩日联赛',
    nav_games: '对局状况', nav_standings: '排行榜', nav_history: '棋谱历史',
    my_team: '我的队伍', vote_only: '(仅限中/韩/日 IP投票)',
    black: '黑', white: '白',
    move_no: n => `第${n}手`,
    divine_waiting: '⚡ 等待神之一手',
    next_move: '下一手', current_turn: '当前回合',
    click_to_vote: '点击投票', can_vote: '可以投票！', opponent_turn: '对方回合',
    h2h_title: '对战成绩', status_title: '现状',
    prisoners: n => `提子 ${n}个`, total_moves: '总手数',
    votes_title: n => `投票状况 (${n}处)`, no_votes: '暂无投票',
    btn_pass: '投虚手', my_vote: c => `我的投票: ${c}`,
    elo_rating: 'ELO 评分',
    vote_done: c => `投票完成: ${c}`, vote_fail: '投票失败',
    opponent_turn_toast: '现在是对方回合。',
    divine_toast: (f, n, c) => `⚡ 神之一手！${f} ${n} → ${c}`,
    standings_title: '🏆 ELO 排行榜', rank: '名次', country: '国家',
    h2h_section: '⚔️ 对战成绩',
    h2h_col_a: '国家 A', h2h_record: '对战成绩 (胜-平-负)', h2h_col_b: '国家 B',
    history_title: '📜 棋谱历史',
    loading: '加载中...', no_history: '暂无已完成的对局。',
    history_winner: n => `🏆 ${n} 胜`, history_draw: '平局',
    history_moves: n => `${n}手`,
    score_line: (bf, bs, wf, ws) => `${bf}黑 ${bs}目  vs  ${wf}白 ${ws}目`,
    result_win: '胜利！', result_win_sub: (f, n) => `${f} ${n} 获胜！`,
    result_lose: '失败', result_lose_sub: (f, n) => `${f} ${n} 败北...`,
    result_draw: '平局', result_draw_sub: '平局',
    result_close: '继续观看', ad_area: '广告区域',
    locale: 'zh-CN',
    names: { KR: '韩国', CN: '中国', JP: '日本', US: '美国' },
  },
  JP: {
    html_lang: 'ja', title: '国別対抗囲碁 🌏', footer: '国別対抗囲碁 · 10分毎に着手 · 韓中日リーグ戦',
    nav_games: '対局状況', nav_standings: 'ランキング', nav_history: '棋譜履歴',
    my_team: 'マイチーム', vote_only: '(日/韓/中 IPのみ投票可)',
    black: '黒', white: '白',
    move_no: n => `第${n}手`,
    divine_waiting: '⚡ 神の一手を待っています',
    next_move: '次の着手', current_turn: '現在の番',
    click_to_vote: 'クリックして投票', can_vote: '投票できます！', opponent_turn: '相手の番です',
    h2h_title: '対戦成績', status_title: '現況',
    prisoners: n => `アゲハマ ${n}個`, total_moves: '総手数',
    votes_title: n => `投票状況 (${n}箇所)`, no_votes: 'まだ投票なし',
    btn_pass: 'パス投票', my_vote: c => `投票済: ${c}`,
    elo_rating: 'ELO レーティング',
    vote_done: c => `投票完了: ${c}`, vote_fail: '投票失敗',
    opponent_turn_toast: '現在は相手の番です。',
    divine_toast: (f, n, c) => `⚡ 神の一手！${f} ${n} → ${c}`,
    standings_title: '🏆 ELO ランキング', rank: '順位', country: '国',
    h2h_section: '⚔️ 対戦成績',
    h2h_col_a: '国 A', h2h_record: '成績 (勝-分-負)', h2h_col_b: '国 B',
    history_title: '📜 棋譜履歴',
    loading: '読み込み中...', no_history: 'まだ完了した対局がありません。',
    history_winner: n => `🏆 ${n} 勝`, history_draw: '引き分け',
    history_moves: n => `${n}手`,
    score_line: (bf, bs, wf, ws) => `${bf}黒 ${bs}目  vs  ${wf}白 ${ws}目`,
    result_win: '勝利！', result_win_sub: (f, n) => `${f} ${n} 勝利！`,
    result_lose: '敗北', result_lose_sub: (f, n) => `${f} ${n} 敗北...`,
    result_draw: '引き分け', result_draw_sub: '引き分け',
    result_close: '引き続き観戦', ad_area: '広告エリア',
    locale: 'ja-JP',
    names: { KR: '韓国', CN: '中国', JP: '日本', US: '米国' },
  },
  EN: {
    html_lang: 'en', title: 'Nations Go Championship 🌏', footer: 'Nations Go · Move every 10 min · KR/CN/JP/US League',
    nav_games: 'Games', nav_standings: 'Rankings', nav_history: 'Game History',
    my_team: 'My Team', vote_only: '(Voting: KR/CN/JP IPs only)',
    black: 'Black', white: 'White',
    move_no: n => `Move ${n}`,
    divine_waiting: '⚡ Divine Move Waiting',
    next_move: 'Next move', current_turn: 'Current turn',
    click_to_vote: 'Click to vote', can_vote: 'You can vote!', opponent_turn: "Opponent's turn",
    h2h_title: 'Head to Head', status_title: 'Status',
    prisoners: n => `Captures: ${n}`, total_moves: 'Total moves',
    votes_title: n => `Votes (${n} spots)`, no_votes: 'No votes yet',
    btn_pass: 'Vote Pass', my_vote: c => `My vote: ${c}`,
    elo_rating: 'ELO Rating',
    vote_done: c => `Voted: ${c}`, vote_fail: 'Vote failed',
    opponent_turn_toast: "It's the opponent's turn.",
    divine_toast: (f, n, c) => `⚡ Divine Move! ${f} ${n} → ${c}`,
    standings_title: '🏆 ELO Rankings', rank: 'Rank', country: 'Country',
    h2h_section: '⚔️ Head to Head',
    h2h_col_a: 'Team A', h2h_record: 'Record (W-D-L)', h2h_col_b: 'Team B',
    history_title: '📜 Game History',
    loading: 'Loading...', no_history: 'No completed games yet.',
    history_winner: n => `🏆 ${n} wins`, history_draw: 'Draw',
    history_moves: n => `${n} moves`,
    score_line: (bf, bs, wf, ws) => `${bf}Black ${bs}pt  vs  ${wf}White ${ws}pt`,
    result_win: 'VICTORY!', result_win_sub: (f, n) => `${f} ${n} Wins!`,
    result_lose: 'DEFEAT', result_lose_sub: (f, n) => `${f} ${n} Loses...`,
    result_draw: 'DRAW', result_draw_sub: 'Draw',
    result_close: 'Keep watching', ad_area: 'Advertisement',
    locale: 'en-US',
    names: { KR: 'Korea', CN: 'China', JP: 'Japan', US: 'USA' },
  },
};

function getLang() {
  const c = state.myCountry;
  if (c === 'KR') return LANGS.KR;
  if (c === 'CN') return LANGS.CN;
  if (c === 'JP') return LANGS.JP;
  return LANGS.EN;
}
// 번역 함수: key에 따라 문자열 또는 함수 결과 반환
function T(key, ...args) {
  const l = getLang();
  const v = l[key];
  if (typeof v === 'function') return v(...args);
  return v ?? key;
}
// 국가명 (접속 언어 기준)
function getCountryName(code) { return getLang().names[code] || code; }
// 국가 전체 정보 (flag/colors + 현재 언어 name)
function getCountryInfo(code) {
  const m = COUNTRY_META[code] || {};
  return { ...m, name: getCountryName(code) };
}
// 정적 HTML 요소에 현재 언어 적용
function applyLang() {
  const l = getLang();
  document.documentElement.lang = l.html_lang;
  document.title = l.title;
  const h1 = document.querySelector('header h1');
  if (h1) h1.textContent = l.title;
  const btnGames     = document.querySelector('[data-page="games"]');
  const btnStandings = document.querySelector('[data-page="standings"]');
  const btnHistory   = document.querySelector('[data-page="history"]');
  if (btnGames)     btnGames.textContent     = l.nav_games;
  if (btnStandings) btnStandings.textContent = l.nav_standings;
  if (btnHistory)   btnHistory.textContent   = l.nav_history;
  const footer = document.querySelector('footer p');
  if (footer) footer.textContent = l.footer;
  const adSpans = document.querySelectorAll('.ad-banner span');
  adSpans.forEach(s => { s.textContent = l.ad_area; });
  const closeBtn = document.querySelector('.result-close');
  if (closeBtn) closeBtn.textContent = l.result_close;
}

// 하위 호환: 기존 COUNTRY_INFO 참조 제거 → getCountryInfo() 사용
const COUNTRY_INFO = new Proxy({}, { get: (_, code) => getCountryInfo(code) });

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
    const blackInfo = getCountryInfo(g.black_code);
    const whiteInfo = getCountryInfo(g.white_code);
    const isSelected = state.selectedGameId === g.id;
    const turnCode = g.current_turn === 'black' ? g.black_code : g.white_code;
    const turnInfo = getCountryInfo(turnCode);
    const nextAt = new Date(g.next_move_at);
    const remaining = Math.max(0, nextAt - Date.now());
    const mm = String(Math.floor(remaining / 60000)).padStart(2, '0');
    const ss = String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0');

    return `
      <div class="game-card${isSelected ? ' selected' : ''}" data-id="${g.id}">
        <div class="game-card-header">
          <div class="matchup">
            <div class="country">
              <span class="flag">${blackInfo.flag}</span>
              <span class="cname">${blackInfo.name} (${T('black')})</span>
              <span class="elo">${gs?.black?.elo || 1500}</span>
            </div>
            <span class="vs">vs</span>
            <div class="country">
              <span class="flag">${whiteInfo.flag}</span>
              <span class="cname">${whiteInfo.name} (${T('white')})</span>
              <span class="elo">${gs?.white?.elo || 1500}</span>
            </div>
          </div>
          <span class="turn-badge">${turnInfo.flag} ${turnInfo.name}</span>
        </div>
        <div style="padding:10px 16px;font-size:0.8rem;color:var(--text-dim);display:flex;justify-content:space-between">
          <span>${T('move_no', g.move_number)}</span>
          ${isDivineModeActive(g.id, gs)
            ? `<span style="color:#a855f7;font-weight:bold;animation:divine-pulse 1.5s infinite">${T('divine_waiting')}</span>`
            : `<span>${T('next_move')}: <b style="color:var(--gold)">${mm}:${ss}</b></span>`
          }
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
  const blackInfo = getCountryInfo(game.black_code);
  const whiteInfo = getCountryInfo(game.white_code);
  const turnInfo  = getCountryInfo(turnCode);

  detail.innerHTML = `
    <hr style="border-color:var(--bg3);margin-bottom:20px">
    <div class="detail-layout">
      <div class="board-wrap">
        <div class="timer-bar">
          <div class="turn-info">
            ${T('current_turn')}: <span>${turnInfo.flag} ${turnInfo.name} (${game.current_turn === 'black' ? T('black') : T('white')})</span>
          </div>
          ${isDivineModeActive(gameId, gs)
            ? `<div class="countdown divine-waiting" id="detail-countdown">${T('divine_waiting')}</div>`
            : `<div class="countdown" id="detail-countdown">--:--</div>`
          }
        </div>
        <canvas id="go-board"></canvas>
        <div style="font-size:0.8rem;color:var(--text-dim);text-align:center">
          ${T('click_to_vote')} · ${isMyTurn ? `<span style="color:var(--gold)">${T('can_vote')}</span>` : T('opponent_turn')}
        </div>
      </div>

      <div class="sidebar">
        <!-- 상대전적 -->
        <div class="panel">
          <h3>${T('h2h_title')}</h3>
          <div class="h2h-row">
            <span>${blackInfo.flag} ${blackInfo.name}</span>
            <span class="h2h-score">${h2hBlack} - ${h2hDraw} - ${h2hWhite}</span>
            <span>${whiteInfo.flag} ${whiteInfo.name}</span>
          </div>
        </div>

        <!-- 현황/포로 -->
        <div class="panel">
          <h3>${T('status_title')}</h3>
          <div class="score-row">
            <span><span class="stone-black"></span>${blackInfo.name} (${T('black')})</span>
            <span>${T('prisoners', game.prisoners_black)}</span>
          </div>
          <div class="score-row">
            <span><span class="stone-white"></span>${whiteInfo.name} (${T('white')})</span>
            <span>${T('prisoners', game.prisoners_white)}</span>
          </div>
          <div class="score-row" style="margin-top:6px;padding-top:6px;border-top:1px solid var(--bg3)">
            <span style="color:var(--text-dim)">${T('total_moves')}</span>
            <span>${T('move_no', game.move_number)}</span>
          </div>
        </div>

        <!-- 투표 현황 -->
        <div class="panel">
          <h3>${T('votes_title', voteCounts.length)}</h3>
          <div class="vote-list">
            ${topVotes.length === 0
              ? `<div style="color:var(--text-dim);font-size:0.85rem">${T('no_votes')}</div>`
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
              <button class="btn-pass" id="btn-pass">${T('btn_pass')}</button>
              <div class="my-vote-info" id="my-vote-info">
                ${myVote ? T('my_vote', myVote.x !== null ? `${COL_LABELS[myVote.x]}${BOARD_SIZE - myVote.y}` : 'PASS') : ''}
              </div>
            </div>
          ` : ''}
        </div>

        <!-- ELO -->
        <div class="panel">
          <h3>${T('elo_rating')}</h3>
          <div class="score-row">
            <span>${blackInfo.flag} ${blackInfo.name}</span>
            <span style="color:var(--accent);font-weight:bold">${black.elo}</span>
          </div>
          <div class="score-row">
            <span>${whiteInfo.flag} ${whiteInfo.name}</span>
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
    if (!isMyTurn) { showToast(T('opponent_turn_toast')); return; }
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
      showToast(T('vote_done', coord));
      const info = document.getElementById('my-vote-info');
      if (info) info.textContent = T('my_vote', coord);
      // 보드 재그리기
      const gs = state.gameStates[gameId];
      if (gs) {
        const canvas = document.getElementById('go-board');
        drawBoard(canvas, gs.board, gs.voteCounts, null, { x, y });
      }
    } else {
      showToast(data.error || T('vote_fail'));
    }
  } catch {
    showToast('네트워크 오류');
  }
}

// ── 타이머 ────────────────────────────────────────────────────────────────
function startDetailTimer(gameId, nextMoveAt) {
  clearInterval(state.timers['detail']);
  state.timers['detail'] = setInterval(() => {
    const el = document.getElementById('detail-countdown');
    if (!el) { clearInterval(state.timers['detail']); return; }

    // 신의 한수 대기 중이면 타이머 표시 안 함
    const gs = state.gameStates[gameId];
    if (isDivineModeActive(gameId, gs)) {
      el.textContent = T('divine_waiting');
      el.style.color = '#a855f7';
      return;
    }

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
      <h2 style="margin-bottom:16px;color:var(--gold)">${T('standings_title')}</h2>
      <table class="standings-table">
        <thead><tr>
          <th>${T('rank')}</th><th>${T('country')}</th><th>ELO</th>
        </tr></thead>
        <tbody>
          ${standings.map((c, i) => `
            <tr>
              <td class="rank">${rankIcon[i] || i + 1}</td>
              <td>${c.flag} ${getCountryName(c.code)}</td>
              <td class="elo-val">${c.elo}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <h2 style="margin:28px 0 16px;color:var(--gold)">${T('h2h_section')}</h2>
      <table class="h2h-table">
        <thead><tr>
          <th>${T('h2h_col_a')}</th><th>${T('h2h_record')}</th><th>${T('h2h_col_b')}</th>
        </tr></thead>
        <tbody>
          ${h2hList.map(h => `
            <tr>
              <td>${h.flag_a} ${getCountryName(h.country_a)}</td>
              <td style="text-align:center">
                <span style="color:var(--gold);font-weight:bold">${h.wins_a}</span>
                <span style="color:var(--text-dim)"> - ${h.draws} - </span>
                <span style="color:var(--accent);font-weight:bold">${h.wins_b}</span>
              </td>
              <td>${h.flag_b} ${getCountryName(h.country_b)}</td>
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
  app.innerHTML = `<div style="color:var(--text-dim);text-align:center;padding:40px">${T('loading')}</div>`;
  const history = await api('/api/history');

  if (history.length === 0) {
    app.innerHTML = `<div style="color:var(--text-dim);text-align:center;padding:40px">${T('no_history')}</div>`;
    return;
  }

  app.innerHTML = `
    <h2 style="margin-bottom:16px;color:var(--gold)">${T('history_title')}</h2>
    <div class="history-list">
      ${history.map(g => {
        const date = new Date(g.ended_at).toLocaleDateString(T('locale'));
        const blackName = getCountryName(g.black_code) || g.black_name;
        const whiteName = getCountryName(g.white_code) || g.white_name;
        const winnerName = g.winner_code ? getCountryName(g.winner_code) : null;
        return `
          <div class="history-item">
            <div class="history-matchup">
              ${g.black_flag} ${blackName} (${T('black')}) vs ${g.white_flag} ${whiteName} (${T('white')})
            </div>
            <div class="history-winner">
              ${winnerName ? T('history_winner', winnerName) : T('history_draw')}
            </div>
            <div class="history-date">${date} · ${T('history_moves', g.move_number)}</div>
            <button class="btn-sgf" onclick="downloadSGF(${g.id})">SGF</button>
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

// ── 신의 한수 대기 상태 관리 ─────────────────────────────────────────────
// divineModeGames: { gameId: votingCountry } - 신의 한수 대기 중인 게임들
const divineModeGames = {};

function setDivineModeActive(gameId, votingCountry, active) {
  if (active) {
    divineModeGames[gameId] = votingCountry;
  } else {
    delete divineModeGames[gameId];
  }
  // 현재 보고 있는 게임이면 UI 갱신
  if (state.selectedGameId === gameId) renderGameDetail(gameId);
  renderGameCards();
}

// 현재 게임이 신의 한수 대기 중인지 (state.game.divine_mode 또는 캐시)
function isDivineModeActive(gameId, gameState) {
  return divineModeGames[gameId] !== undefined
    || (gameState?.game?.divine_mode === 1);
}

// ── 신의 한수 토스트 (특별 스타일) ───────────────────────────────────────
let divineTimer;
function showDivineToast(msg) {
  let el = document.getElementById('divine-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'divine-toast';
    el.style.cssText = `
      position:fixed; top:80px; left:50%; transform:translateX(-50%) scale(0.8);
      background:linear-gradient(135deg,#1a0a3d,#3d1a6b);
      border:2px solid #a855f7; color:#e9d5ff;
      padding:14px 28px; border-radius:30px; font-size:1.1rem; font-weight:bold;
      opacity:0; pointer-events:none; z-index:9990;
      transition:opacity .3s, transform .3s;
      box-shadow:0 0 30px rgba(168,85,247,0.5);
      white-space:nowrap;
    `;
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  el.style.transform = 'translateX(-50%) scale(1)';
  clearTimeout(divineTimer);
  divineTimer = setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(-50%) scale(0.8)';
  }, 4000);
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

// ── Win/Lose/Draw 오버레이 ──────────────────────────────────────────────
let confettiAnim = null;

function showResultOverlay(type, countryCode, blackScore, whiteScore, blackCode, whiteCode) {
  const overlay  = document.getElementById('result-overlay');
  const flagEl   = document.getElementById('result-flag');
  const textEl   = document.getElementById('result-text');
  const subEl    = document.getElementById('result-sub');
  const scoreEl  = document.getElementById('result-score');
  const bgEl     = overlay.querySelector('.result-bg');

  const info      = getCountryInfo(countryCode);
  const blackInfo = getCountryInfo(blackCode);
  const whiteInfo = getCountryInfo(whiteCode);

  flagEl.textContent = info.flag || '🏁';
  bgEl.className = 'result-bg ' + type;

  if (type === 'win') {
    textEl.textContent  = T('result_win');
    textEl.className    = 'result-text win';
    subEl.textContent   = T('result_win_sub', info.flag, info.name);
    startConfetti(info.colors || ['#FFD700', '#FF6B6B', '#4ECDC4']);
  } else if (type === 'lose') {
    textEl.textContent  = T('result_lose');
    textEl.className    = 'result-text lose';
    subEl.textContent   = T('result_lose_sub', info.flag, info.name);
    document.body.classList.add('shake');
    setTimeout(() => document.body.classList.remove('shake'), 700);
  } else {
    textEl.textContent  = T('result_draw');
    textEl.className    = 'result-text draw';
    subEl.textContent   = T('result_draw_sub');
  }

  const bs = blackScore?.toFixed(1) ?? '?';
  const ws = whiteScore?.toFixed(1) ?? '?';
  scoreEl.textContent = T('score_line', blackInfo.flag, bs, whiteInfo.flag, ws);

  // 결과 닫기 버튼 텍스트도 현재 언어로
  const closeBtn = document.querySelector('.result-close');
  if (closeBtn) closeBtn.textContent = T('result_close');

  overlay.classList.add('show');

  // 8초 후 자동 닫기
  setTimeout(closeResultOverlay, 8000);
}

function closeResultOverlay() {
  const overlay = document.getElementById('result-overlay');
  overlay.classList.remove('show');
  stopConfetti();
}

// ── 컨페티 ───────────────────────────────────────────────────────────────
function startConfetti(colors) {
  const canvas = document.getElementById('confetti-canvas');
  const ctx = canvas.getContext('2d');
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles = Array.from({ length: 160 }, () => ({
    x:    Math.random() * canvas.width,
    y:    Math.random() * -canvas.height,
    vx:   (Math.random() - 0.5) * 4,
    vy:   2 + Math.random() * 4,
    size: 6 + Math.random() * 10,
    color: colors[Math.floor(Math.random() * colors.length)],
    rotation: Math.random() * 360,
    rotSpeed: (Math.random() - 0.5) * 8,
    shape: Math.random() > 0.5 ? 'rect' : 'circle',
  }));

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05; // 중력
      p.rotation += p.rotSpeed;
      if (p.y > canvas.height + 20) {
        p.y = -20;
        p.x = Math.random() * canvas.width;
        p.vy = 2 + Math.random() * 4;
      }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation * Math.PI / 180);
      ctx.fillStyle = p.color;
      if (p.shape === 'rect') {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });
    confettiAnim = requestAnimationFrame(draw);
  }
  draw();
}

function stopConfetti() {
  if (confettiAnim) { cancelAnimationFrame(confettiAnim); confettiAnim = null; }
  const canvas = document.getElementById('confetti-canvas');
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}

// ── 초기화 ────────────────────────────────────────────────────────────────
async function init() {
  applyLang(); // 초기 기본 언어 (EN) 적용

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
