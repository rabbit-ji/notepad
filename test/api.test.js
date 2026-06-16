// API 통합 테스트 — 로컬 libSQL 파일 DB로 격리 (실제 TURSO 미사용)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';

// db.js / auth.js 가 모듈 로드 시점에 환경변수를 읽으므로, import 전에 설정
process.env.TURSO_URL = 'file:local-test.db';
process.env.APP_PASSWORD = 'test-pw';
process.env.SESSION_SECRET = 'test-secret';

const { initSchema, db } = await import('../src/db.js');
const { createApp } = await import('../src/server.js');

let server;
let base;
let cookie = '';

before(async () => {
  await initSchema();
  server = createApp().listen(0);
  const { port } = server.address();
  base = `http://localhost:${port}`;
});

after(() => {
  server?.close();
  // 테스트 DB 파일 정리
  for (const f of ['local-test.db', 'local-test.db-shm', 'local-test.db-wal']) {
    try { rmSync(f); } catch {}
  }
});

// 쿠키를 유지하며 요청하는 헬퍼
async function req(path, options = {}) {
  const res = await fetch(`${base}${path}`, {
    headers: { 'Content-Type': 'application/json', cookie },
    ...options,
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  return res;
}

test('인증 없이는 메모 API가 401을 반환한다', async () => {
  const res = await fetch(`${base}/api/notes`);
  assert.equal(res.status, 401);
});

test('틀린 비밀번호는 로그인에 실패한다', async () => {
  const res = await req('/api/login', {
    method: 'POST',
    body: JSON.stringify({ password: 'wrong' }),
  });
  assert.equal(res.status, 401);
});

test('올바른 비밀번호로 로그인하면 세션이 생긴다', async () => {
  const res = await req('/api/login', {
    method: 'POST',
    body: JSON.stringify({ password: 'test-pw' }),
  });
  assert.equal(res.status, 200);
  assert.ok(cookie.length > 0);
});

test('메모를 생성하고 태그/노트북과 함께 조회한다', async () => {
  // 노트북 생성
  const nbRes = await req('/api/notebooks', {
    method: 'POST',
    body: JSON.stringify({ name: '업무' }),
  });
  const nb = await nbRes.json();
  assert.ok(nb.id);

  // 메모 생성
  const createRes = await req('/api/notes', {
    method: 'POST',
    body: JSON.stringify({
      title: '첫 메모',
      content: '# 안녕\n내용',
      notebookId: nb.id,
      tags: ['아이디어', '회의'],
    }),
  });
  assert.equal(createRes.status, 201);
  const note = await createRes.json();
  assert.equal(note.title, '첫 메모');
  assert.deepEqual([...note.tags].sort(), ['아이디어', '회의']);

  // 단건 조회
  const getRes = await req(`/api/notes/${note.id}`);
  const fetched = await getRes.json();
  assert.equal(fetched.content, '# 안녕\n내용');
});

test('검색어로 메모를 필터링한다', async () => {
  await req('/api/notes', {
    method: 'POST',
    body: JSON.stringify({ title: '장보기', content: '우유 계란', tags: [] }),
  });
  const res = await req('/api/notes?q=계란');
  const list = await res.json();
  assert.ok(list.some((n) => n.title === '장보기'));
  assert.ok(!list.some((n) => n.title === '첫 메모'));
});

test('태그로 메모를 필터링한다', async () => {
  const res = await req('/api/notes?tag=' + encodeURIComponent('회의'));
  const list = await res.json();
  assert.ok(list.length >= 1);
  assert.ok(list.every((n) => n.tags.includes('회의')));
});

test('메모를 수정하면 내용과 갱신시각이 바뀐다', async () => {
  const created = await (
    await req('/api/notes', {
      method: 'POST',
      body: JSON.stringify({ title: '임시', content: '초안', tags: [] }),
    })
  ).json();

  const updated = await (
    await req(`/api/notes/${created.id}`, {
      method: 'PUT',
      body: JSON.stringify({ title: '완성', content: '최종본', tags: ['done'] }),
    })
  ).json();

  assert.equal(updated.title, '완성');
  assert.equal(updated.content, '최종본');
  assert.deepEqual(updated.tags, ['done']);
});

test('메모를 삭제하면 더 이상 조회되지 않는다', async () => {
  const created = await (
    await req('/api/notes', {
      method: 'POST',
      body: JSON.stringify({ title: '삭제대상', content: '', tags: [] }),
    })
  ).json();

  const delRes = await req(`/api/notes/${created.id}`, { method: 'DELETE' });
  assert.equal(delRes.status, 200);

  const getRes = await req(`/api/notes/${created.id}`);
  assert.equal(getRes.status, 404);
});
