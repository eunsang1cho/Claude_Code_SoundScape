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

// 리그 매칭 쌍 (한중일 라운드로빈)
// 각 쌍은 교대로 흑/백 배정
const LEAGUE_PAIRS = [
  { black: 'KR', white: 'JP' },
  { black: 'CN', white: 'KR' },
  { black: 'JP', white: 'CN' },
];

// 활성 게임이 없는 쌍에 새 게임 생성
function initLeagueGames() {
  const activeGames = db.prepare(`SELECT black_code, white_code FROM games WHERE status = 'active'`).all();
  const activePairs = new Set(activeGames.map(g => `${g.black_code}-${g.white_code}`));

  const insertGame = db.prepare(`
    INSERT INTO games (black_code, white_code, board_state, next_move_at, current_turn, sgf)
    VALUES (?, ?, ?, ?, 'black', '')
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
  const voteCounts = db.prepare(`
    SELECT x, y, COUNT(*) as count
    FROM votes
    WHERE game_id = ? AND move_number = ? AND country_code = ?
    GROUP BY x, y
    ORDER BY count DESC
    LIMIT 10
  `).all(game.id, game.move_number, votingCountry);

  // 이전 보드 (Ko 체크용)
  const prevMove = db.prepare(`
    SELECT * FROM moves WHERE game_id = ? AND move_number = ? - 2 LIMIT 1
  `).get(game.id, game.move_number);

  // 이전 보드 상태 재구성은 간략화: 현재는 Ko 체크 생략 (추후 개선)
  const resolved = resolveBestMove(voteCounts, board, color, null);

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
    // 게임 종료 처리
    finishGame(game, newBoard, newSGF, newPrisoners);
  } else {
    db.prepare(`
      UPDATE games SET
        board_state = ?,
        current_turn = ?,
        move_number = ?,
        prisoners_black = ?,
        prisoners_white = ?,
        next_move_at = ?,
        sgf = ?
      WHERE id = ?
    `).run(
      JSON.stringify(newBoard),
      newTurn,
      newMoveNo,
      newPrisoners.black,
      newPrisoners.white,
      nextMoveAt(),
      newSGF,
      game.id
    );
  }

  return { resolved, captured, newBoard, newMoveNo };
}

function finishGame(game, finalBoard, sgf, prisoners) {
  const { blackScore, whiteScore } = scoreBoard(finalBoard);
  const blackTotal = blackScore - prisoners.white; // 상대가 따낸 돌 차감
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

  // 게임 완료 업데이트
  db.prepare(`
    UPDATE games SET status = 'finished', winner_code = ?, ended_at = datetime('now'), sgf = ?
    WHERE id = ?
  `).run(winnerCode, sgf, game.id);

  // ELO 갱신
  if (winnerCode && loserCode) {
    const winner = db.prepare(`SELECT elo FROM countries WHERE code = ?`).get(winnerCode);
    const loser = db.prepare(`SELECT elo FROM countries WHERE code = ?`).get(loserCode);
    const { winnerGain, loserLoss } = calcElo(winner.elo, loser.elo);

    db.prepare(`UPDATE countries SET elo = elo + ? WHERE code = ?`).run(winnerGain, winnerCode);
    db.prepare(`UPDATE countries SET elo = elo - ? WHERE code = ?`).run(loserLoss, loserCode);
  }

  // 상대전적 갱신
  updateHeadToHead(game.black_code, game.white_code, winnerCode);

  console.log(`[Game] 게임 종료 #${game.id}: 흑${blackTotal.toFixed(1)} vs 백${whiteTotal.toFixed(1)}, 승자: ${winnerCode || '무승부'}`);

  // 새 게임 예약
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

// 만료된 턴 처리 (cron에서 호출)
function processDueTurns(broadcast) {
  const dueGames = db.prepare(`
    SELECT * FROM games
    WHERE status = 'active' AND next_move_at <= datetime('now')
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
  getGameState,
  getStandings,
  getActiveGames,
  getGameHistory,
};
