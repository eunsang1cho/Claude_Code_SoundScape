// 바둑 룰 엔진 (19x19)
const SIZE = 19;

function emptyBoard() {
  return new Array(SIZE * SIZE).fill(0); // 0=빈칸 1=흑 2=백
}

function idx(x, y) {
  return y * SIZE + x;
}

function getNeighbors(x, y) {
  const neighbors = [];
  if (x > 0)        neighbors.push([x - 1, y]);
  if (x < SIZE - 1) neighbors.push([x + 1, y]);
  if (y > 0)        neighbors.push([x, y - 1]);
  if (y < SIZE - 1) neighbors.push([x, y + 1]);
  return neighbors;
}

// 연결된 돌 그룹과 활로 계산
function getGroup(board, x, y) {
  const color = board[idx(x, y)];
  if (!color) return { stones: [], liberties: [] };

  const stones = [];
  const liberties = new Set();
  const visited = new Set();
  const stack = [[x, y]];

  while (stack.length) {
    const [cx, cy] = stack.pop();
    const key = `${cx},${cy}`;
    if (visited.has(key)) continue;
    visited.add(key);
    stones.push([cx, cy]);

    for (const [nx, ny] of getNeighbors(cx, cy)) {
      const nval = board[idx(nx, ny)];
      if (nval === 0) {
        liberties.add(`${nx},${ny}`);
      } else if (nval === color && !visited.has(`${nx},${ny}`)) {
        stack.push([nx, ny]);
      }
    }
  }

  return {
    stones,
    liberties: [...liberties].map(k => k.split(',').map(Number))
  };
}

// 돌 따냄: 활로 0인 상대 그룹 제거, 제거 개수 반환
function removeDeadGroups(board, opponentColor) {
  let captured = 0;
  const visited = new Set();

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (board[idx(x, y)] !== opponentColor) continue;
      const key = `${x},${y}`;
      if (visited.has(key)) continue;

      const { stones, liberties } = getGroup(board, x, y);
      stones.forEach(([sx, sy]) => visited.add(`${sx},${sy}`));

      if (liberties.length === 0) {
        stones.forEach(([sx, sy]) => {
          board[idx(sx, sy)] = 0;
          captured++;
        });
      }
    }
  }
  return captured;
}

// 착수 유효성 검사 및 착수
// returns: { ok, board, captured, error }
function placeStone(boardArr, x, y, color, prevBoardArr) {
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) {
    return { ok: false, error: '범위 초과' };
  }

  const board = [...boardArr];
  const opponentColor = color === 1 ? 2 : 1;

  if (board[idx(x, y)] !== 0) {
    return { ok: false, error: '이미 돌이 있음' };
  }

  board[idx(x, y)] = color;

  // 상대 돌 따내기
  const captured = removeDeadGroups(board, opponentColor);

  // 자충수 체크 (따낸 후에도 활로 없으면 무효)
  const { liberties } = getGroup(board, x, y);
  if (liberties.length === 0) {
    return { ok: false, error: '자충수' };
  }

  // 패(Ko) 체크: 이전 보드와 동일하면 무효
  if (prevBoardArr && board.join(',') === prevBoardArr.join(',')) {
    return { ok: false, error: '패(Ko) 위반' };
  }

  return { ok: true, board, captured };
}

// 최다 득표 유효 수 찾기 (무효 수 건너뜀)
function resolveBestMove(votes, boardArr, color, prevBoardArr) {
  // votes: [{x, y, count}] 내림차순 정렬
  const sorted = [...votes].sort((a, b) => b.count - a.count);

  for (const vote of sorted) {
    if (vote.x === null && vote.y === null) {
      // pass 투표
      return { pass: true };
    }
    const result = placeStone(boardArr, vote.x, vote.y, color, prevBoardArr);
    if (result.ok) {
      return { pass: false, x: vote.x, y: vote.y, result };
    }
  }

  // 유효 수 없으면 pass
  return { pass: true };
}

// 간단한 집 계산 (게임 종료 시)
function scoreBoard(board) {
  const territory = new Array(SIZE * SIZE).fill(0);
  const scored = new Set();

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (board[idx(x, y)] !== 0 || scored.has(`${x},${y}`)) continue;

      // BFS로 빈칸 영역 탐색
      const region = [];
      const borders = new Set();
      const stack = [[x, y]];
      const visited = new Set([`${x},${y}`]);

      while (stack.length) {
        const [cx, cy] = stack.pop();
        region.push([cx, cy]);

        for (const [nx, ny] of getNeighbors(cx, cy)) {
          const nval = board[idx(nx, ny)];
          if (nval !== 0) {
            borders.add(nval);
          } else if (!visited.has(`${nx},${ny}`)) {
            visited.add(`${nx},${ny}`);
            stack.push([nx, ny]);
          }
        }
      }

      region.forEach(([rx, ry]) => scored.add(`${rx},${ry}`));

      if (borders.size === 1) {
        const owner = [...borders][0];
        region.forEach(([rx, ry]) => { territory[idx(rx, ry)] = owner; });
      }
    }
  }

  let blackScore = 0, whiteScore = 0;
  for (let i = 0; i < SIZE * SIZE; i++) {
    if (board[i] === 1 || territory[i] === 1) blackScore++;
    if (board[i] === 2 || territory[i] === 2) whiteScore++;
  }

  // 덤 6.5집
  whiteScore += 6.5;
  return { blackScore, whiteScore };
}

// SGF 좌표 변환
function toSGFCoord(x, y) {
  const letters = 'abcdefghijklmnopqrs';
  return letters[x] + letters[y];
}

module.exports = {
  SIZE,
  emptyBoard,
  placeStone,
  resolveBestMove,
  scoreBoard,
  toSGFCoord,
};
