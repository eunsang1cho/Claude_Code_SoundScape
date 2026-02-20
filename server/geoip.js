const axios = require('axios');

// 지원 국가 (한중일)
const SUPPORTED = new Set(['KR', 'CN', 'JP', 'US']);

// 개발/테스트용 오버라이드 (쿼리스트링 ?country=KR)
function getCountryFromQuery(req) {
  const c = req.query.country;
  if (c && SUPPORTED.has(c.toUpperCase())) return c.toUpperCase();
  return null;
}

// IP에서 국가 코드 추출
async function getCountryByIP(ip) {
  // 로컬/개발 환경
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return null; // 로컬은 쿼리 오버라이드 필요
  }

  try {
    const res = await axios.get(`http://ip-api.com/json/${ip}?fields=countryCode`, {
      timeout: 3000
    });
    const code = res.data?.countryCode;
    return SUPPORTED.has(code) ? code : null;
  } catch {
    return null;
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
