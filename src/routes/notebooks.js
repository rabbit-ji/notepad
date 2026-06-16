// 노트북(폴더) CRUD
import { Router } from 'express';
import { db } from '../db.js';

export const notebooksRouter = Router();

// 노트북 목록 + 각 노트북의 메모 개수
notebooksRouter.get('/', async (_req, res) => {
  const { rows } = await db.execute(
    `SELECT nb.*, COUNT(n.id) AS noteCount
     FROM notebooks nb LEFT JOIN notes n ON n.notebook_id = nb.id
     GROUP BY nb.id ORDER BY nb.name`
  );
  res.json(rows);
});

notebooksRouter.post('/', async (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  if (!name) return res.status(400).json({ error: '노트북 이름이 필요합니다.' });
  const result = await db.execute({
    sql: 'INSERT INTO notebooks (name) VALUES (?)',
    args: [name],
  });
  res.status(201).json({ id: Number(result.lastInsertRowid), name });
});

notebooksRouter.put('/:id', async (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  if (!name) return res.status(400).json({ error: '노트북 이름이 필요합니다.' });
  await db.execute({
    sql: 'UPDATE notebooks SET name = ? WHERE id = ?',
    args: [name, Number(req.params.id)],
  });
  res.json({ ok: true });
});

// 노트북 삭제 (메모는 notebook_id가 NULL로 풀려 '미분류'가 됨)
notebooksRouter.delete('/:id', async (req, res) => {
  await db.execute({
    sql: 'DELETE FROM notebooks WHERE id = ?',
    args: [Number(req.params.id)],
  });
  res.json({ ok: true });
});
