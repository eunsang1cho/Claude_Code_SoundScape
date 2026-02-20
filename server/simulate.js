/**
 * 바둑 엔진 단위테스트 + 고속 게임 시뮬레이션
 * 실행: node server/simulate.js
 */
const { placeStone, emptyBoard, scoreBoard, resolveBestMove, SIZE } = require('./goEngine');

// ── ANSI 컬러 ─────────────────────────────────────────────────────────────
const c = {
  green:  s => `\x1b[32m${s}\x1b[0m`,
  red:    s => `\x1b[31m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  cyan:   s => `\x1b[36m${s}\x1b[0m`,
  bold:   s => `\x1b[1m${s}\x1b[0m`,
  dim:    s => `\x1b[2m${s}\x1b[0m`,
};

let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(c.green('  ✓'), name);
    passed++;
  } catch (e) {
    console.log(c.red('  ✗'), name, c.red(`→ ${e.message}`));
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function idx(x, y) { return y * SIZE + x; }

// ── 보드 ASCII 출력 (작은 구역만) ──────────────────────────────────────────
function printRegion(board, x0, y0, size = 7) {
  const labels = 'ABCDEFGHJKLMNOPQRST';
  let header = '   ';
  for (let x = x0; x < Math.min(x0 + size, SIZE); x++) header += labels[x] + ' ';
  console.log(c.dim(header));
  for (let y = y0; y < Math.min(y0 + size, SIZE); y++) {
    let row = c.dim(String(SIZE - y).padStart(2) + ' ');
    for (let x = x0; x < Math.min(x0 + size, SIZE); x++) {
      const v = board[idx(x, y)];
      row += v === 1 ? c.bold('● ') : v === 2 ? c.bold('○ ') : c.dim('· ');
    }
    console.log(row);
  }
}

// ════════════════════════════════════════════════════════════════
// 1. 단위 테스트
// ════════════════════════════════════════════════════════════════
console.log(c.cyan(c.bold('\n━━ 바둑 엔진 단위 테스트 ━━━━━━━━━━━━━━━━━━━━━━━━\n')));

// ── 1-1. 기본 착수 ────────────────────────────────────────────────
console.log(c.yellow('1. 기본 착수'));

test('빈칸에 흑 착수 성공', () => {
  const b = emptyBoard();
  const { ok, board } = placeStone(b, 3, 3, 1, null);
  assert(ok, '착수 실패');
  assert(board[idx(3, 3)] === 1, '돌 없음');
});

test('이미 돌 있는 곳 착수 거부', () => {
  const b = emptyBoard();
  b[idx(3, 3)] = 1;
  const { ok, error } = placeStone(b, 3, 3, 2, null);
  assert(!ok, '거부 안됨');
  assert(error.includes('이미'), `에러 메시지 이상: ${error}`);
});

test('범위 초과 거부', () => {
  const b = emptyBoard();
  assert(!placeStone(b, -1, 0, 1, null).ok, '-1,0 거부 안됨');
  assert(!placeStone(b, 19, 0, 1, null).ok, '19,0 거부 안됨');
  assert(!placeStone(b, 0, 19, 1, null).ok, '0,19 거부 안됨');
});

// ── 1-2. 따냄 ────────────────────────────────────────────────────
console.log(c.yellow('\n2. 따냄 (capture)'));

test('단수 → 따냄', () => {
  // 백돌 하나를 흑으로 포위
  //  · ● ·
  //  ● ○ ●
  //  · ● ·   ← 마지막 ● 착수 시 ○ 따냄
  const b = emptyBoard();
  b[idx(1, 0)] = 1; // 흑
  b[idx(0, 1)] = 1;
  b[idx(2, 1)] = 1;
  b[idx(1, 1)] = 2; // 백 (포위됨)
  const { ok, board, captured } = placeStone(b, 1, 2, 1, null);
  assert(ok, '착수 실패');
  assert(captured === 1, `포로 수 이상: ${captured}`);
  assert(board[idx(1, 1)] === 0, '백돌 안 없어짐');
});

test('여러 돌 체인 따냄', () => {
  // 백 3개 체인을 흑이 완전 포위
  const b = emptyBoard();
  // 백 체인: (2,0),(3,0),(4,0)
  b[idx(2, 0)] = 2; b[idx(3, 0)] = 2; b[idx(4, 0)] = 2;
  // 포위 흑돌 배치
  b[idx(1, 0)] = 1;
  b[idx(2, 1)] = 1; b[idx(3, 1)] = 1; b[idx(4, 1)] = 1;
  b[idx(5, 0)] = 1;
  // 마지막으로 위를 막으면 되는데 위가 이미 벽(y=0)이므로 아래로만 막으면 됨
  // (2,0)의 활로: 없음 (위=벽, 좌=(1,0)=흑, 우=(3,0)=백그룹, 아래=(2,1)=흑)
  // 백그룹 전체 활로 확인: (5,0) 오른쪽이 비어있음 → 아직 살아있음
  // (5,0)에도 흑 놓기
  b[idx(5, 0)] = 1; // 이미 흑이라고 가정

  // 이번엔 간단하게: 백 1줄 완전 포위
  const b2 = emptyBoard();
  b2[idx(5, 5)] = 2; b2[idx(6, 5)] = 2;
  b2[idx(4, 5)] = 1; b2[idx(7, 5)] = 1;
  b2[idx(5, 4)] = 1; b2[idx(6, 4)] = 1;
  b2[idx(5, 6)] = 1;
  // 아직 (6,6)이 비어있어 활로 있음
  const r = placeStone(b2, 6, 6, 1, null);
  assert(r.ok, '착수 실패');
  assert(r.captured === 2, `포로 수 이상: ${r.captured}`);
  assert(r.board[idx(5, 5)] === 0, '백돌 안 없어짐');
  assert(r.board[idx(6, 5)] === 0, '백돌 안 없어짐2');
});

// ── 1-3. 자충수 ──────────────────────────────────────────────────
console.log(c.yellow('\n3. 자충수 (suicide) 거부'));

test('단독 자충수 거부', () => {
  // 모서리 자충수: (0,0)을 흑으로 포위 후 다시 흑 착수 시도
  const b = emptyBoard();
  b[idx(1, 0)] = 2; // 백이 포위
  b[idx(0, 1)] = 2;
  // (0,0)에 흑 놓으면 활로 0 → 자충수
  const { ok, error } = placeStone(b, 0, 0, 1, null);
  assert(!ok, '자충수 허용됨');
  assert(error.includes('자충수'), `에러: ${error}`);
});

test('자충수이지만 상대 따내면 유효 (예외 없음 - Japanese 룰)', () => {
  // 백을 따내면서 동시에 활로 확보 → 유효
  // 흑이 (0,0)에 두면서 백 (1,0),(0,1)을 따내야 활로 생김
  const b = emptyBoard();
  b[idx(1, 0)] = 2; b[idx(0, 1)] = 2;
  // (0,0)에 흑 두면: 백 따냄 → 흑에 활로 생김 → 유효
  // but 백 체인이 완전 포위되어야 함
  // (1,0)의 활로: (2,0), (1,1) → 아직 살아있음
  // → 따냄 안됨 → 자충수
  const { ok } = placeStone(b, 0, 0, 1, null);
  assert(!ok, '자충수가 허용됨 (실제로 따냄 없는 상황)');
});

test('상대 잡으면서 활로 확보 → 유효', () => {
  // (0,0)에 흑, 백이 (1,0),(0,1)에 있고 완전 포위됨
  const b = emptyBoard();
  b[idx(1, 0)] = 2; b[idx(0, 1)] = 2;
  b[idx(2, 0)] = 1; b[idx(1, 1)] = 1; b[idx(0, 2)] = 1;
  // 백 체인: (1,0),(0,1) - 활로: (0,0) 뿐
  // (0,0)에 흑 두면: 백 따냄 → 유효
  const { ok, captured } = placeStone(b, 0, 0, 1, null);
  assert(ok, '유효수 거부됨');
  assert(captured === 2, `포로 수: ${captured}`);
});

// ── 1-4. Ko (패) ──────────────────────────────────────────────────
console.log(c.yellow('\n4. Ko (패) 규칙'));

test('패 재착수 거부', () => {
  // 실제 Ko 모양 (교과서적):
  //  · ● ○ ·
  //  ● ○ · ○   ← (2,1)이 Ko 착점, 백(1,1)이 흑에 포위
  //  · ● ○ ·
  // 흑(1,0),(0,1),(1,2), 백(1,1),(2,0),(2,2),(3,1)
  // 흑 (2,1) 착수 → 백(1,1) 따냄
  // 백 (1,1) 재착수 → 흑(2,1) 따냄 → 원래 보드 복원 → Ko 위반
  const b = emptyBoard();
  b[idx(1, 0)] = 1; b[idx(0, 1)] = 1; b[idx(1, 2)] = 1; // 흑
  b[idx(1, 1)] = 2; b[idx(2, 0)] = 2; b[idx(2, 2)] = 2; b[idx(3, 1)] = 2; // 백

  const r1 = placeStone(b, 2, 1, 1, null); // 흑 (2,1) → 백(1,1) 따냄
  assert(r1.ok && r1.captured === 1, `흑 따냄 실패: ${JSON.stringify(r1)}`);

  // 백 (1,1) → 흑(2,1) 따냄 → 원래 보드 b 복원 → Ko
  const r2 = placeStone(r1.board, 1, 1, 2, b);
  assert(!r2.ok, `Ko 허용됨 (error: ${r2.error})`);
  assert(r2.error.includes('Ko') || r2.error.includes('패'), `Ko 에러 메시지: ${r2.error}`);
});

test('한 수 뒤 Ko 자리 착수 허용', () => {
  const b = emptyBoard();
  b[idx(1, 0)] = 1; b[idx(0, 1)] = 1; b[idx(1, 2)] = 1;
  b[idx(1, 1)] = 2; b[idx(2, 0)] = 2; b[idx(2, 2)] = 2; b[idx(3, 1)] = 2;

  const r1 = placeStone(b, 2, 1, 1, null);  // 흑이 Ko 착점 → 백(1,1) 따냄
  // 백이 다른 곳(10,10)에 착수 → 이제 이전 보드가 r1.board로 바뀜
  const r2 = placeStone(r1.board, 10, 10, 2, r1.board);
  assert(r2.ok, `백 착수 실패: ${r2.error}`);
  // 백이 (1,1)에 두면: 결과 보드가 r1.board(백의 이전 보드)와 다름 → Ko 아님
  const r3 = placeStone(r2.board, 1, 1, 2, r1.board);
  assert(r3.ok, `패 해소 후 착수 거부: ${r3.error}`);
});

// ── 1-5. 집 계산 ──────────────────────────────────────────────────
console.log(c.yellow('\n5. 집 계산 (scoring)'));

test('흑이 전판 채우면 흑 361점', () => {
  const b = new Array(SIZE * SIZE).fill(1); // 흑이 전부
  const { blackScore, whiteScore } = scoreBoard(b);
  assert(blackScore === 361, `흑 ${blackScore}`);
  assert(whiteScore === 6.5, `백(덤만) ${whiteScore}`);
});

test('좌우 반씩 + 흑 영역이 더 클때 흑 집 > 백 집 (덤 전)', () => {
  const b = emptyBoard();
  // 흑: x=0~10 (11열), 백: x=12~18 (7열), x=11 중립
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (x < 11) b[idx(x, y)] = 1;
      else if (x > 11) b[idx(x, y)] = 2;
    }
  }
  const { blackScore, whiteScore } = scoreBoard(b);
  console.log(c.dim(`    → 흑영역:${blackScore} 백영역(덤포함):${whiteScore}`));
  // 흑 11열×19 = 209, 백 7열×19 = 133 + 덤6.5 = 139.5 → 흑 승
  assert(blackScore > whiteScore, `흑이 더 많아야 함 (흑:${blackScore} 백:${whiteScore})`);
});

test('덤 6.5 적용', () => {
  const b = emptyBoard();
  // 흑 180집, 백 181집 → 덤으로 백 승
  for (let i = 0; i < 180; i++) b[i] = 1;
  for (let i = 180; i < 361; i++) b[i] = 2;
  const { blackScore, whiteScore } = scoreBoard(b);
  assert(whiteScore > blackScore, `덤 후 백 승이어야 함 (흑:${blackScore} 백:${whiteScore})`);
});

// ── 1-6. resolveBestMove ──────────────────────────────────────────
console.log(c.yellow('\n6. resolveBestMove (최다 득표 수 결정)'));

test('최다 득표 유효 수 선택', () => {
  const b = emptyBoard();
  const votes = [
    { x: 3, y: 3, count: 50 },
    { x: 4, y: 4, count: 30 },
  ];
  const result = resolveBestMove(votes, b, 1, null);
  assert(!result.pass, '패스 됨');
  assert(result.x === 3 && result.y === 3, `좌표 이상: ${result.x},${result.y}`);
});

test('1위 득표가 무효이면 2위 선택', () => {
  const b = emptyBoard();
  b[idx(3, 3)] = 2; // 이미 돌 있음 → 무효
  const votes = [
    { x: 3, y: 3, count: 100 }, // 무효
    { x: 5, y: 5, count: 80 },  // 유효
  ];
  const result = resolveBestMove(votes, b, 1, null);
  assert(!result.pass, '패스 됨');
  assert(result.x === 5 && result.y === 5, `2위 수 선택 안됨: ${result.x},${result.y}`);
});

test('모두 무효이면 패스', () => {
  const b = emptyBoard();
  // 모든 칸 채움
  b.fill(1);
  const votes = [{ x: 0, y: 0, count: 99 }];
  const result = resolveBestMove(votes, b, 2, null);
  assert(result.pass, '패스 안됨');
});

test('패스 투표 처리', () => {
  const b = emptyBoard();
  const votes = [{ x: null, y: null, count: 10 }];
  const result = resolveBestMove(votes, b, 1, null);
  assert(result.pass, '패스 안됨');
});

// ════════════════════════════════════════════════════════════════
// 2. 고속 게임 시뮬레이션
// ════════════════════════════════════════════════════════════════
console.log(c.cyan(c.bold('\n━━ 고속 게임 시뮬레이션 ━━━━━━━━━━━━━━━━━━━━━━━━\n')));

async function runSimulation() {
  const MOVE_INTERVAL_MS = 80;  // 80ms = 초당 12.5수
  const MAX_MOVES = 300;
  const INVALID_RATE = 0.25;    // 25%는 의도적 무효 수 투표

  let board = emptyBoard();
  let prevBoard = null;
  let moveNo = 0;
  let consecutivePasses = 0;
  let prisoners = { black: 0, white: 0 };
  let invalidCount = 0, captureEvents = 0;
  const moveLog = [];

  const labels = 'ABCDEFGHJKLMNOPQRST';

  console.log(`인터벌: ${MOVE_INTERVAL_MS}ms/수, 최대 ${MAX_MOVES}수, 무효수 비율 ${INVALID_RATE*100}%\n`);

  function randomVotes(currentBoard, color, includeInvalid) {
    const votes = [];

    // 의도적 무효 수: 이미 돌 있는 곳
    if (includeInvalid && Math.random() < INVALID_RATE) {
      const occupied = [];
      for (let i = 0; i < SIZE * SIZE; i++) {
        if (currentBoard[i] !== 0) occupied.push(i);
      }
      if (occupied.length > 0) {
        const i = occupied[Math.floor(Math.random() * occupied.length)];
        votes.push({ x: i % SIZE, y: Math.floor(i / SIZE), count: 999 }); // 1위 무효수
        invalidCount++;
      }
    }

    // 랜덤 유효 수 후보 5개
    for (let k = 0; k < 5; k++) {
      if (Math.random() < 0.05) {
        votes.push({ x: null, y: null, count: Math.floor(Math.random() * 20) + 1 });
      } else {
        votes.push({
          x: Math.floor(Math.random() * SIZE),
          y: Math.floor(Math.random() * SIZE),
          count: Math.floor(Math.random() * 50) + 1,
        });
      }
    }

    return votes.sort((a, b) => b.count - a.count);
  }

  function step() {
    const color = moveNo % 2 === 0 ? 1 : 2;
    const colorName = color === 1 ? c.bold('●흑') : c.bold('○백');
    const votes = randomVotes(board, color, true);

    const resolved = resolveBestMove(votes, board, color, prevBoard);

    if (resolved.pass) {
      consecutivePasses++;
      const coord = 'PASS';
      process.stdout.write(c.dim(`${String(moveNo+1).padStart(3)}. ${colorName} ${coord}  `));
      moveLog.push({ moveNo, color, pass: true });
    } else {
      consecutivePasses = 0;
      const { x, y, result } = resolved;
      const coord = `${labels[x]}${SIZE - y}`;

      prevBoard = [...board];
      board = result.board;

      if (color === 1) prisoners.white += result.captured;
      else prisoners.black += result.captured;
      if (result.captured > 0) captureEvents++;

      const captStr = result.captured > 0 ? c.red(` [+${result.captured}따냄]`) : '';
      process.stdout.write(`${String(moveNo+1).padStart(3)}. ${colorName} ${coord.padEnd(4)}${captStr}  `);
      moveLog.push({ moveNo, color, x, y, captured: result.captured });
    }

    if ((moveNo + 1) % 6 === 0) process.stdout.write('\n');
    moveNo++;

    if (consecutivePasses >= 2 || moveNo >= MAX_MOVES) {
      return false; // 종료
    }
    return true;
  }

  // 비동기 루프
  await new Promise(resolve => {
    function tick() {
      const cont = step();
      if (cont) setTimeout(tick, MOVE_INTERVAL_MS);
      else resolve();
    }
    tick();
  });

  process.stdout.write('\n\n');

  // 결과
  const { blackScore, whiteScore } = scoreBoard(board);
  const blackTotal = blackScore - prisoners.black;
  const whiteTotal = whiteScore - prisoners.white;

  console.log(c.cyan('── 최종 결과 ────────────────────────────────────────'));
  console.log(`총 수:       ${moveNo}수`);
  console.log(`포로 (흑/백): ●${prisoners.black}개 / ○${prisoners.white}개`);
  console.log(`의도적 무효수: ${invalidCount}회 → 모두 skip됨`);
  console.log(`따냄 이벤트:  ${captureEvents}회`);
  console.log(`종료 원인:    ${consecutivePasses >= 2 ? '연속 2패스' : '최대 수 도달'}`);
  console.log();
  console.log(`집 계산:`);
  console.log(`  ● 흑: ${blackScore.toFixed(1)} - 포로${prisoners.black} = ${c.bold(blackTotal.toFixed(1))}`);
  console.log(`  ○ 백: ${whiteScore.toFixed(1)} (덤포함) - 포로${prisoners.black} = ${c.bold(whiteTotal.toFixed(1))}`);
  console.log();

  if (blackTotal > whiteTotal) {
    console.log(c.green(c.bold('  ★ 흑 승리! ' + (blackTotal - whiteTotal).toFixed(1) + '집 차이')));
  } else if (whiteTotal > blackTotal) {
    console.log(c.green(c.bold('  ★ 백 승리! ' + (whiteTotal - blackTotal).toFixed(1) + '집 차이')));
  } else {
    console.log(c.yellow(c.bold('  ★ 무승부')));
  }

  console.log();
  console.log(c.cyan('── 최종 보드 상태 (좌상 7×7) ───────────────────────'));
  printRegion(board, 0, 0, 7);

  return { blackTotal, whiteTotal };
}

// ════════════════════════════════════════════════════════════════
// 실행
// ════════════════════════════════════════════════════════════════
async function main() {
  // 단위 테스트 결과
  console.log(c.cyan(c.bold('\n━━ 단위 테스트 결과 ━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')));
  const total = passed + failed;
  if (failed === 0) {
    console.log(c.green(c.bold(`✅ 전체 통과: ${passed}/${total}`)));
  } else {
    console.log(c.red(c.bold(`❌ ${failed}개 실패: ${passed}/${total} 통과`)));
  }

  console.log();
  await runSimulation();
}

main().catch(console.error);
