// 태그 목록 조회 (사이드바용)
import { Router } from 'express';
import { db } from '../db.js';

export const tagsRouter = Router();

// 실제 메모에 연결된 태그만, 사용 횟수와 함께 반환
tagsRouter.get('/', async (_req, res) => {
  const { rows } = await db.execute(
    `SELECT t.id, t.name, COUNT(nt.note_id) AS noteCount
     FROM tags t JOIN note_tags nt ON nt.tag_id = t.id
     GROUP BY t.id ORDER BY t.name`
  );
  res.json(rows);
});
