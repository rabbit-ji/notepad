// 메모(노트) CRUD + 검색 + 태그 연결
import { Router } from 'express';
import { db } from '../db.js';

export const notesRouter = Router();

// 메모 한 건에 달린 태그 이름 목록을 합쳐서 반환하는 헬퍼
async function attachTags(notes) {
  if (notes.length === 0) return notes;
  const ids = notes.map((n) => n.id);
  const placeholders = ids.map(() => '?').join(',');
  const { rows } = await db.execute({
    sql: `SELECT nt.note_id AS noteId, t.name AS name
          FROM note_tags nt JOIN tags t ON t.id = nt.tag_id
          WHERE nt.note_id IN (${placeholders})`,
    args: ids,
  });
  const byNote = new Map();
  for (const r of rows) {
    if (!byNote.has(r.noteId)) byNote.set(r.noteId, []);
    byNote.get(r.noteId).push(r.name);
  }
  return notes.map((n) => ({ ...n, tags: byNote.get(n.id) ?? [] }));
}

// 입력으로 들어온 태그 이름들을 보장(없으면 생성)하고 메모에 연결
async function syncTags(noteId, tagNames) {
  if (!Array.isArray(tagNames)) return;
  await db.execute({ sql: 'DELETE FROM note_tags WHERE note_id = ?', args: [noteId] });
  for (const raw of tagNames) {
    const name = String(raw).trim();
    if (!name) continue;
    await db.execute({
      sql: 'INSERT OR IGNORE INTO tags (name) VALUES (?)',
      args: [name],
    });
    const { rows } = await db.execute({
      sql: 'SELECT id FROM tags WHERE name = ?',
      args: [name],
    });
    await db.execute({
      sql: 'INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)',
      args: [noteId, rows[0].id],
    });
  }
}

// 목록 조회 — 노트북/태그/검색어로 필터
notesRouter.get('/', async (req, res) => {
  const { notebookId, tag, q } = req.query;
  const where = [];
  const args = [];

  if (notebookId) {
    where.push('n.notebook_id = ?');
    args.push(Number(notebookId));
  }
  if (q) {
    where.push('(n.title LIKE ? OR n.content LIKE ?)');
    args.push(`%${q}%`, `%${q}%`);
  }
  if (tag) {
    where.push(
      'n.id IN (SELECT nt.note_id FROM note_tags nt JOIN tags t ON t.id = nt.tag_id WHERE t.name = ?)'
    );
    args.push(String(tag));
  }

  const sql = `SELECT n.* FROM notes n
               ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY n.updated_at DESC`;
  const { rows } = await db.execute({ sql, args });
  res.json(await attachTags(rows));
});

// 단건 조회
notesRouter.get('/:id', async (req, res) => {
  const { rows } = await db.execute({
    sql: 'SELECT * FROM notes WHERE id = ?',
    args: [Number(req.params.id)],
  });
  if (rows.length === 0) return res.status(404).json({ error: '메모를 찾을 수 없습니다.' });
  const [note] = await attachTags(rows);
  res.json(note);
});

// 생성
notesRouter.post('/', async (req, res) => {
  const { title = '', content = '', notebookId = null, tags = [] } = req.body ?? {};
  const result = await db.execute({
    sql: 'INSERT INTO notes (title, content, notebook_id) VALUES (?, ?, ?)',
    args: [String(title), String(content), notebookId ? Number(notebookId) : null],
  });
  const id = Number(result.lastInsertRowid);
  await syncTags(id, tags);
  const { rows } = await db.execute({ sql: 'SELECT * FROM notes WHERE id = ?', args: [id] });
  const [note] = await attachTags(rows);
  res.status(201).json(note);
});

// 수정
notesRouter.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { title, content, notebookId, tags } = req.body ?? {};
  const { rows: existing } = await db.execute({
    sql: 'SELECT * FROM notes WHERE id = ?',
    args: [id],
  });
  if (existing.length === 0) return res.status(404).json({ error: '메모를 찾을 수 없습니다.' });

  const cur = existing[0];
  await db.execute({
    sql: `UPDATE notes SET title = ?, content = ?, notebook_id = ?, updated_at = datetime('now')
          WHERE id = ?`,
    args: [
      title !== undefined ? String(title) : cur.title,
      content !== undefined ? String(content) : cur.content,
      notebookId !== undefined ? (notebookId ? Number(notebookId) : null) : cur.notebook_id,
      id,
    ],
  });
  if (tags !== undefined) await syncTags(id, tags);

  const { rows } = await db.execute({ sql: 'SELECT * FROM notes WHERE id = ?', args: [id] });
  const [note] = await attachTags(rows);
  res.json(note);
});

// 삭제
notesRouter.delete('/:id', async (req, res) => {
  await db.execute({ sql: 'DELETE FROM notes WHERE id = ?', args: [Number(req.params.id)] });
  res.json({ ok: true });
});
