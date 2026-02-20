const axios = require('axios');

// 팀 코드 (한중일 + 월드)
const SUPPORTED = new Set(['KR', 'CN', 'JP', 'WORLD']);
const EAST_ASIA  = new Set(['KR', 'CN', 'JP']);

// 개발/테스트용 오버라이드 (쿼리스트링 ?country=KR)
function getCountryFromQuery(req) {
  const c = req.query.country;
  if (c && SUPPORTED.has(c.toUpperCase())) return c.toUpperCase();
  return null;
}

// IP에서 국가 코드 추출
async function getCountryByIP(ip) {
  // 로컬/개발 환경 → 쿼리 오버라이드 필요
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return null;
  }

  try {
    const res = await axios.get(`http://ip-api.com/json/${ip}?fields=countryCode`, {
      timeout: 3000
    });
    const code = res.data?.countryCode;
    // 한중일 → 해당 팀, 나머지 전 세계 → WORLD
    return EAST_ASIA.has(code) ? code : 'WORLD';
  } catch {
    return 'WORLD'; // API 실패 시 WORLD로 처리
  }
}

// Express 미들웨어: req.countryCode 설정
async function countryMiddleware(req, res, next) {
  // 1. 쿼리 오버라이드 (개발용)
  const fromQuery = getCountryFromQuery(req);
  if (fromQuery) {
    req.countryCode = fromQuery;
    return next();
  }

  // 2. IP 판별
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  req.clientIP = ip;
  req.countryCode = await getCountryByIP(ip);
  next();
}

module.exports = { countryMiddleware, SUPPORTED };
