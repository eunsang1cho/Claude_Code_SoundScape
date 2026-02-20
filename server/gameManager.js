const db = require('./db');
const { emptyBoard, placeStone, resolveBestMove, scoreBoard, toSGFCoord } = require('./goEngine');

// ELO 계산
function calcElo(winnerElo, loserElo, kFactor = 32) {
  const expected = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
  const delta = Math.round(kFactor * (1 - expected));
  return { winnerGain: delta, loserLoss: delta };
}

// 다음 착수 시각 (10분 후)
function nextMoveAt() {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 10);
  d.setSeconds(0);
  d.setMilliseconds(0);
  return d.toISOString();
}

// 리그 매칭 쌍 (한중일미 라운드로빈 6경기)
const LEAGUE_PAIRS = [
  { black: 'KR', white: 'JP' },
  { black: 'CN', white: 'KR' },
  { black: 'JP', white: 'CN' },
  { black: 'US', white: 'KR' },
  { black: 'CN', white: 'US' },
  { black: 'JP', white: 'US' },
];

// 활성 게임이 없는 쌍에 새 게임 생성
function initLeagueGames() {
  const activeGames = db.prepare(`SELECT black_code, white_code FROM games WHERE status = 'active'`).all();
  const activePairs = new Set(activeGames.map(g => `${g.black_code}-${g.white_code}`));

  const insertGame = db.prepare(`
    INSERT INTO games (black_code, white_code, board_state, prev_board_state, next_move_at, current_turn, sgf)
    VALUES (?, ?, ?, NULL, ?, 'black', '')
  `);

  for (const { black, white } of LEAGUE_PAIRS) {
    const key = `${black}-${white}`;
    if (!activePairs.has(key)) {
      const board = JSON.stringify(emptyBoard());
      insertGame.run(black, white, board, nextMoveAt());
      console.log(`[Game] 새 게임 생성: ${black} vs ${white}`);
    }
  }
}

// 투표 집계 후 착수 처리
function processTurn(game) {
  const board = JSON.parse(game.board_state);
  const color = game.current_turn === 'black' ? 1 : 2;
  const votingCountry = game.current_turn === 'black' ? game.black_code : game.white_code;

  // 해당 국가의 투표 집계
  // 동점 시: 최후점 우선 (MAX(voted_at) DESC)
  const voteCounts = db.prepare(`
    SELECT x, y, COUNT(*) as count, MAX(voted_at) as latest_vote
    FROM votes
    WHERE game_id = ? AND move_number = ? AND country_code = ?
    GROUP BY x, y
    ORDER BY count DESC, latest_vote DESC
    LIMIT 10
  `).all(game.id, game.move_number, votingCountry);

  // Ko 체크용: 2수 전 보드 상태
  const prevBoardArr = game.prev_board_state ? JSON.parse(game.prev_board_state) : null;

  // 투표 0개 → 신의 한수 대기 모드 진입 (착수 없음, 무한 대기)
  if (voteCounts.length === 0) {
    db.prepare(`
      UPDATE games SET divine_mode = 1, next_move_at = '2099-01-01T00:00:00.000Z' WHERE id = ?
    `).run(game.id);
    console.log(`[신의 한수] game#${game.id} ${votingCountry} 투표 0개 → 신의 한수 대기 시작`);
    return { divineMode: true, gameId: game.id, votingCountry };
  }

  const resolved = resolveBestMove(voteCounts, board, color, prevBoardArr);

  let newBoard = board;
  let captured = 0;
  let sgfMove = '';
  let passCount = 0;

  if (resolved.pass) {
    // 패스
    sgfMove = game.current_turn === 'black' ? ';B[]' : ';W[]';
  } else {
    const { x, y, result } = resolved;
    newBoard = result.board;
    captured = result.captured;
    sgfMove = game.current_turn === 'black'
      ? `;B[${toSGFCoord(x, y)}]`
      : `;W[${toSGFCoord(x, y)}]`;

    // 착수 기록
    db.prepare(`
      INSERT INTO moves (game_id, move_number, x, y, color, vote_count)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(game.id, game.move_number, x, y, game.current_turn, voteCounts[0]?.count || 0);
  }

  // 연속 패스 2회 → 게임 종료
  const lastMove = db.prepare(`
    SELECT x, y FROM moves WHERE game_id = ? ORDER BY move_number DESC LIMIT 1
  `).get(game.id);

  const bothPassed = resolved.pass && lastMove && lastMove.x === null && lastMove.y === null;

  const newTurn = game.current_turn === 'black' ? 'white' : 'black';
  const newMoveNo = game.move_number + 1;
  const newPrisoners = game.current_turn === 'black'
    ? { black: game.prisoners_black + captured, white: game.prisoners_white }
    : { black: game.prisoners_black, white: game.prisoners_white + captured };

  const newSGF = game.sgf + sgfMove;

  if (bothPassed) {
    finishGame(game, newBoard, newSGF, newPrisoners);
    return { resolved, captured, newBoard, newMoveNo, finished: true };
  } else {
    db.prepare(`
      UPDATE games SET
        board_state = ?,
        prev_board_state = ?,
        current_turn = ?,
        move_number = ?,
        prisoners_black = ?,
        prisoners_white = ?,
        next_move_at = ?,
        sgf = ?
      WHERE id = ?
    `).run(
      JSON.stringify(newBoard),
      game.board_state,   // 현재 보드가 다음 차례의 "2수 전" 보드가 됨
      newTurn,
      newMoveNo,
      newPrisoners.black,
      newPrisoners.white,
      nextMoveAt(),
      newSGF,
      game.id
    );
  }

  return { resolved, captured, newBoard, newMoveNo, finished: false };
}

// onFinish 콜백: 종료 이벤트를 index.js로 전달
let _onFinishCallback = null;
function setOnFinishCallback(fn) { _onFinishCallback = fn; }

function finishGame(game, finalBoard, sgf, prisoners) {
  const { blackScore, whiteScore } = scoreBoard(finalBoard);
  const blackTotal = blackScore - prisoners.white;
  const whiteTotal = whiteScore - prisoners.black;

  let winnerCode = null;
  let loserCode = null;

  if (blackTotal > whiteTotal) {
    winnerCode = game.black_code;
    loserCode = game.white_code;
  } else if (whiteTotal > blackTotal) {
    winnerCode = game.white_code;
    loserCode = game.black_code;
  }

  db.prepare(`
    UPDATE games SET status = 'finished', winner_code = ?, ended_at = datetime('now'), sgf = ?
    WHERE id = ?
  `).run(winnerCode, sgf, game.id);

  if (winnerCode && loserCode) {
    const winner = db.prepare(`SELECT elo FROM countries WHERE code = ?`).get(winnerCode);
    const loser  = db.prepare(`SELECT elo FROM countries WHERE code = ?`).get(loserCode);
    const { winnerGain, loserLoss } = calcElo(winner.elo, loser.elo);
    db.prepare(`UPDATE countries SET elo = elo + ? WHERE code = ?`).run(winnerGain, winnerCode);
    db.prepare(`UPDATE countries SET elo = elo - ? WHERE code = ?`).run(loserLoss, loserCode);
  }

  updateHeadToHead(game.black_code, game.white_code, winnerCode);

  const margin = Math.abs(blackTotal - whiteTotal).toFixed(1);
  console.log(`[Game] 종료 #${game.id}: 흑${blackTotal.toFixed(1)} 백${whiteTotal.toFixed(1)}, 승자: ${winnerCode || '무승부'} (${margin}집 차)`);

  // 종료 이벤트 콜백
  if (_onFinishCallback) {
    _onFinishCallback({
      gameId: game.id,
      blackCode: game.black_code,
      whiteCode: game.white_code,
      winnerCode,
      blackScore: blackTotal,
      whiteScore: whiteTotal,
      margin: Number(margin),
    });
  }

  setTimeout(initLeagueGames, 5000);
}

function updateHeadToHead(codeA, codeB, winnerCode) {
  // 정렬된 키 사용 (country_a < country_b)
  const [a, b] = [codeA, codeB].sort();
  const isAWinner = winnerCode === a;
  const isBWinner = winnerCode === b;

  if (!winnerCode) {
    db.prepare(`UPDATE head_to_head SET draws = draws + 1 WHERE country_a = ? AND country_b = ?`).run(a, b);
  } else if (isAWinner) {
    db.prepare(`UPDATE head_to_head SET wins_a = wins_a + 1 WHERE country_a = ? AND country_b = ?`).run(a, b);
  } else if (isBWinner) {
    db.prepare(`UPDATE head_to_head SET wins_b = wins_b + 1 WHERE country_a = ? AND country_b = ?`).run(a, b);
  }
}

// 만료된 턴 처리 (cron에서 호출) - divine_mode 게임은 제외
function processDueTurns(broadcast) {
  const dueGames = db.prepare(`
    SELECT * FROM games
    WHERE status = 'active' AND divine_mode = 0 AND next_move_at <= datetime('now')
  `).all();

  for (const game of dueGames) {
    try {
      const result = processTurn(game);
      if (broadcast) broadcast(game.id, result);
    } catch (e) {
      console.error(`[Game] 착수 처리 오류 game#${game.id}:`, e.message);
    }
  }
}

// 신의 한수: 대기 중인 게임에서 단 1표(x,y)로 즉시 착수
// 반환: { ok, resolved, captured, newBoard, newMoveNo, finished } | { ok: false, error }
function executeImmediateDivineMove(game, x, y) {
  const board = JSON.parse(game.board_state);
  const color = game.current_turn === 'black' ? 1 : 2;
  const prevBoardArr = game.prev_board_state ? JSON.parse(game.prev_board_state) : null;

  let resolved;
  if (x === null || y === null) {
    resolved = { pass: true };
  } else {
    const result = placeStone(board, x, y, color, prevBoardArr);
    if (!result.ok) {
      // 유효하지 않은 착수 → divine_mode 유지, 다음 투표 대기
      return { ok: false, error: result.error };
    }
    resolved = { pass: false, x, y, result };
  }

  let newBoard = board;
  let captured = 0;
  let sgfMove = '';

  if (resolved.pass) {
    sgfMove = game.current_turn === 'black' ? ';B[]' : ';W[]';
  } else {
    const { x: rx, y: ry, result } = resolved;
    newBoard = result.board;
    captured = result.captured;
    sgfMove = game.current_turn === 'black'
      ? `;B[${toSGFCoord(rx, ry)}]`
      : `;W[${toSGFCoord(rx, ry)}]`;

    // 신의 한수 착수 기록 (vote_count = -1: 신의 한수 표시)
    db.prepare(`
      INSERT INTO moves (game_id, move_number, x, y, color, vote_count)
      VALUES (?, ?, ?, ?, ?, -1)
    `).run(game.id, game.move_number, rx, ry, game.current_turn);
  }

  const lastMove = db.prepare(`
    SELECT x, y FROM moves WHERE game_id = ? ORDER BY move_number DESC LIMIT 1
  `).get(game.id);
  const bothPassed = resolved.pass && lastMove && lastMove.x === null && lastMove.y === null;

  const newTurn = game.current_turn === 'black' ? 'white' : 'black';
  const newMoveNo = game.move_number + 1;
  const newPrisoners = game.current_turn === 'black'
    ? { black: game.prisoners_black + captured, white: game.prisoners_white }
    : { black: game.prisoners_black, white: game.prisoners_white + captured };
  const newSGF = game.sgf + sgfMove;

  if (bothPassed) {
    finishGame(game, newBoard, newSGF, newPrisoners);
    return { ok: true, resolved, captured, newBoard, newMoveNo, finished: true };
  }

  // 착수 성공 → divine_mode 해제, 다음 10분 타이머 재시작
  db.prepare(`
    UPDATE games SET
      board_state = ?,
      prev_board_state = ?,
      current_turn = ?,
      move_number = ?,
      prisoners_black = ?,
      prisoners_white = ?,
      next_move_at = ?,
      divine_mode = 0,
      sgf = ?
    WHERE id = ?
  `).run(
    JSON.stringify(newBoard),
    game.board_state,
    newTurn,
    newMoveNo,
    newPrisoners.black,
    newPrisoners.white,
    nextMoveAt(),
    newSGF,
    game.id
  );

  console.log(`[신의 한수] game#${game.id} 착수 완료 (${x},${y}), divine_mode 해제`);
  return { ok: true, resolved, captured, newBoard, newMoveNo, finished: false };
}

// 현재 게임 상태 + 투표 현황
function getGameState(gameId) {
  const game = db.prepare(`SELECT * FROM games WHERE id = ?`).get(gameId);
  if (!game) return null;

  const black = db.prepare(`SELECT * FROM countries WHERE code = ?`).get(game.black_code);
  const white = db.prepare(`SELECT * FROM countries WHERE code = ?`).get(game.white_code);

  const voteCounts = db.prepare(`
    SELECT x, y, COUNT(*) as count
    FROM votes
    WHERE game_id = ? AND move_number = ?
    GROUP BY x, y
    ORDER BY count DESC
  `).all(game.id, game.move_number);

  const recentMoves = db.prepare(`
    SELECT * FROM moves WHERE game_id = ? ORDER BY move_number DESC LIMIT 5
  `).all(game.id);

  // 상대전적
  const [a, b] = [game.black_code, game.white_code].sort();
  const h2h = db.prepare(`SELECT * FROM head_to_head WHERE country_a = ? AND country_b = ?`).get(a, b);

  return {
    game,
    black,
    white,
    board: JSON.parse(game.board_state),
    voteCounts,
    recentMoves,
    h2h,
    now: new Date().toISOString(),
  };
}

// 전체 순위
function getStandings() {
  return db.prepare(`SELECT * FROM countries ORDER BY elo DESC`).all();
}

// 모든 활성 게임
function getActiveGames() {
  return db.prepare(`SELECT * FROM games WHERE status = 'active' ORDER BY id`).all();
}

// 기보 히스토리
function getGameHistory(limit = 20, offset = 0) {
  return db.prepare(`
    SELECT g.*,
           bc.name as black_name, bc.flag as black_flag,
           wc.name as white_name, wc.flag as white_flag,
           wn.name as winner_name
    FROM games g
    JOIN countries bc ON g.black_code = bc.code
    JOIN countries wc ON g.white_code = wc.code
    LEFT JOIN countries wn ON g.winner_code = wn.code
    WHERE g.status = 'finished'
    ORDER BY g.ended_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);
}

module.exports = {
  initLeagueGames,
  processDueTurns,
  executeImmediateDivineMove,
  setOnFinishCallback,
  getGameState,
  getStandings,
  getActiveGames,
  getGameHistory,
};
