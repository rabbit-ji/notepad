// TURSO(libSQL) 연결 및 스키마 초기화
import { createClient } from '@libsql/client';

const url = process.env.TURSO_URL;
const authToken = process.env.TURSO_TOKEN;

if (!url) {
  throw new Error('TURSO_URL 환경변수가 설정되지 않았습니다. .env를 확인하세요.');
}

// 로컬 파일(file:) URL이면 토큰이 필요 없음 → 테스트에서 활용
export const db = createClient(
  url.startsWith('file:') ? { url } : { url, authToken }
);

// 테이블 생성 (앱 시작 시 1회). 비유: 노트를 정리할 서랍장을 미리 짜두는 것.
export async function initSchema() {
  await db.batch(
    [
      `CREATE TABLE IF NOT EXISTS notebooks (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         name TEXT NOT NULL,
         created_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`,
      `CREATE TABLE IF NOT EXISTS notes (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         notebook_id INTEGER REFERENCES notebooks(id) ON DELETE SET NULL,
         title TEXT NOT NULL DEFAULT '',
         content TEXT NOT NULL DEFAULT '',
         created_at TEXT NOT NULL DEFAULT (datetime('now')),
         updated_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`,
      `CREATE TABLE IF NOT EXISTS tags (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         name TEXT NOT NULL UNIQUE
       )`,
      `CREATE TABLE IF NOT EXISTS note_tags (
         note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
         tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
         PRIMARY KEY (note_id, tag_id)
       )`,
    ],
    'write'
  );
}
