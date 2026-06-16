// 단일 비밀번호 인증 — 세션 쿠키 기반
const APP_PASSWORD = process.env.APP_PASSWORD;

if (!APP_PASSWORD) {
  throw new Error('APP_PASSWORD 환경변수가 설정되지 않았습니다. .env를 확인하세요.');
}

// 로그인 처리: 비밀번호가 맞으면 세션에 인증 플래그를 남긴다.
export function login(req, res) {
  const { password } = req.body ?? {};
  if (typeof password !== 'string' || password !== APP_PASSWORD) {
    return res.status(401).json({ error: '비밀번호가 올바르지 않습니다.' });
  }
  req.session.authed = true;
  res.json({ ok: true });
}

export function logout(req, res) {
  req.session.destroy(() => res.json({ ok: true }));
}

// API 보호 미들웨어. 비유: 출입증(세션)이 없으면 문 앞에서 돌려보낸다.
export function requireAuth(req, res, next) {
  if (req.session?.authed) return next();
  res.status(401).json({ error: '로그인이 필요합니다.' });
}
