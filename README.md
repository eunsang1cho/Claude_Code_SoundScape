# 🌏 국가대항전 바둑

한국 · 중국 · 일본이 IP 기반으로 팀을 이루어 10분마다 바둑 한 수씩 두는 국가대항전 플랫폼.

## 실행 방법

```bash
npm install
npm start        # 프로덕션
npm run dev      # 개발 (nodemon)
```

서버: http://localhost:3000

## 개발 테스트 (IP 오버라이드)

```
http://localhost:3000?country=KR   # 한국으로 접속
http://localhost:3000?country=CN   # 중국으로 접속
http://localhost:3000?country=JP   # 일본으로 접속
```

## 기술 스택

- **Backend**: Node.js + Express + WebSocket (ws) + node-cron
- **Database**: SQLite (better-sqlite3)
- **Frontend**: Vanilla HTML/CSS/JavaScript + Canvas API
- **IP 판별**: ip-api.com
- **ELO 레이팅**: 표준 ELO (K=32)

## 구조

```
server/
  index.js        # Express 서버 + WebSocket + Cron
  db.js           # SQLite 스키마 및 초기화
  goEngine.js     # 바둑 룰 엔진 (착수, 따냄, Ko, 집 계산)
  geoip.js        # IP → 국가 코드 판별
  gameManager.js  # 게임 로직, ELO, 상대전적
public/
  index.html
  css/style.css
  js/app.js       # Canvas 바둑판 + WebSocket + UI
```

## 게임 규칙

- 19x19 바둑판, 덤 6.5집
- 10분마다 해당 국가 투표 중 최다 득표 좌표에 착수
- IP당 1표 (중복 투표 시 덮어씀)
- 연속 2패스 시 집 계산 후 종료
- 승패에 따라 ELO 레이팅 갱신
