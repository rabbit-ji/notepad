// 앱 진입점 — Express 서버 구성 및 기동
import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { initSchema } from './db.js';
import { login, logout, requireAuth } from './auth.js';
import { notesRouter } from './routes/notes.js';
import { notebooksRouter } from './routes/notebooks.js';
import { tagsRouter } from './routes/tags.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 1000 * 60 * 60 * 24 * 30, // 30일
      },
    })
  );

  // 인증 엔드포인트
  app.post('/api/login', login);
  app.post('/api/logout', logout);
  app.get('/api/session', (req, res) => res.json({ authed: !!req.session?.authed }));

  // 보호된 API
  app.use('/api/notes', requireAuth, notesRouter);
  app.use('/api/notebooks', requireAuth, notebooksRouter);
  app.use('/api/tags', requireAuth, tagsRouter);

  // 정적 프론트엔드
  app.use(express.static(publicDir));

  // API 오류 공통 처리 — 자세한 내용은 서버 로그에만 남기고, 사용자에겐 일반 메시지
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  });

  return app;
}

// 직접 실행될 때만 서버 기동 (테스트에서 import 시에는 기동하지 않음)
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const port = process.env.PORT || 3000;
  await initSchema();
  createApp().listen(port, () => {
    console.log(`📝 semina-notepad 실행 중: http://localhost:${port}`);
  });
}
