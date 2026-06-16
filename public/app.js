// semina 메모장 — 프론트엔드 SPA 로직
'use strict';

const $ = (id) => document.getElementById(id);

// 화면 상태
const state = {
  filter: { type: 'all', value: null }, // all | notebook | tag
  notes: [],
  notebooks: [],
  currentNote: null,
  saveTimer: null,
};

let mde = null; // EasyMDE 인스턴스

/* ── API 헬퍼 ─────────────────────────────── */
async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 401) {
    showLogin();
    throw new Error('unauthorized');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || '요청에 실패했습니다.');
  }
  return res.status === 204 ? null : res.json();
}

/* ── 인증 ─────────────────────────────────── */
function showLogin() {
  $('login-screen').hidden = false;
  $('app').hidden = true;
}
function showApp() {
  $('login-screen').hidden = true;
  $('app').hidden = false;
}

async function checkSession() {
  try {
    const { authed } = await api('/session');
    if (authed) {
      showApp();
      await boot();
    } else {
      showLogin();
    }
  } catch {
    showLogin();
  }
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = $('login-error');
  errorEl.hidden = true;
  try {
    await api('/login', {
      method: 'POST',
      body: JSON.stringify({ password: $('password-input').value }),
    });
    $('password-input').value = '';
    showApp();
    await boot();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  }
});

$('logout-btn').addEventListener('click', async () => {
  await api('/logout', { method: 'POST' });
  location.reload();
});

/* ── 초기 로드 ────────────────────────────── */
async function boot() {
  initEditor();
  await Promise.all([loadNotebooks(), loadTags()]);
  await loadNotes();
}

function initEditor() {
  if (mde) return;
  mde = new EasyMDE({
    element: $('note-content'),
    spellChecker: false,
    autofocus: false,
    placeholder: '여기에 마크다운으로 작성하세요…',
    status: false,
    toolbar: [
      'bold', 'italic', 'heading', '|',
      'quote', 'unordered-list', 'ordered-list', '|',
      'link', 'image', 'code', 'table', '|',
      'preview', 'side-by-side', 'fullscreen',
    ],
  });
  mde.codemirror.on('change', () => scheduleSave());
}

/* ── 사이드바: 노트북 ─────────────────────── */
async function loadNotebooks() {
  state.notebooks = await api('/notebooks');
  const ul = $('notebook-list');
  ul.innerHTML = '';
  for (const nb of state.notebooks) {
    const li = document.createElement('li');
    if (state.filter.type === 'notebook' && state.filter.value === nb.id) li.classList.add('active');
    li.innerHTML = `<span>${escapeHtml(nb.name)}</span><span class="count">${nb.noteCount}</span>`;
    li.addEventListener('click', () => setFilter('notebook', nb.id));
    ul.appendChild(li);
  }
  // 에디터의 노트북 선택 옵션도 갱신
  const sel = $('note-notebook');
  sel.innerHTML = '<option value="">미분류</option>';
  for (const nb of state.notebooks) {
    const opt = document.createElement('option');
    opt.value = nb.id;
    opt.textContent = nb.name;
    sel.appendChild(opt);
  }
}

/* ── 사이드바: 태그 ───────────────────────── */
async function loadTags() {
  const tags = await api('/tags');
  const ul = $('tag-list');
  ul.innerHTML = '';
  for (const t of tags) {
    const li = document.createElement('li');
    if (state.filter.type === 'tag' && state.filter.value === t.name) li.classList.add('active');
    li.innerHTML = `<span>${escapeHtml(t.name)}</span><span class="count">${t.noteCount}</span>`;
    li.addEventListener('click', () => setFilter('tag', t.name));
    ul.appendChild(li);
  }
}

/* ── 노트 목록 ────────────────────────────── */
function buildQuery() {
  const q = $('search-input').value.trim();
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (state.filter.type === 'notebook') params.set('notebookId', state.filter.value);
  if (state.filter.type === 'tag') params.set('tag', state.filter.value);
  const s = params.toString();
  return s ? `?${s}` : '';
}

async function loadNotes() {
  state.notes = await api(`/notes${buildQuery()}`);
  renderNoteList();
}

function renderNoteList() {
  const ul = $('note-list');
  ul.innerHTML = '';
  $('empty-list').hidden = state.notes.length > 0;
  for (const note of state.notes) {
    const li = document.createElement('li');
    if (state.currentNote && state.currentNote.id === note.id) li.classList.add('active');
    const preview = stripMarkdown(note.content).slice(0, 100);
    li.innerHTML = `
      <p class="item-title">${escapeHtml(note.title) || '(제목 없음)'}</p>
      <p class="item-preview">${escapeHtml(preview)}</p>
      <p class="item-date">${formatDate(note.updated_at)}</p>`;
    li.addEventListener('click', () => openNote(note.id));
    ul.appendChild(li);
  }
}

function setFilter(type, value) {
  state.filter = { type, value };
  $('all-notes-btn').classList.toggle('active', type === 'all');
  loadNotebooks();
  loadTags();
  loadNotes();
}

$('all-notes-btn').addEventListener('click', () => setFilter('all', null));
$('search-input').addEventListener('input', debounce(loadNotes, 250));

/* ── 노트 열기 / 생성 / 저장 / 삭제 ──────── */
async function openNote(id) {
  const note = await api(`/notes/${id}`);
  state.currentNote = note;
  $('editor-empty').hidden = true;
  $('editor-area').hidden = false;
  $('note-title').value = note.title;
  $('note-notebook').value = note.notebook_id || '';
  $('note-tags').value = (note.tags || []).join(', ');
  mde.value(note.content || '');
  $('save-status').textContent = '';
  renderNoteList();
}

$('new-note-btn').addEventListener('click', async () => {
  const notebookId = state.filter.type === 'notebook' ? state.filter.value : null;
  const note = await api('/notes', {
    method: 'POST',
    body: JSON.stringify({ title: '', content: '', notebookId, tags: [] }),
  });
  await loadNotes();
  await loadNotebooks();
  openNote(note.id);
  $('note-title').focus();
});

function scheduleSave() {
  if (!state.currentNote) return;
  $('save-status').textContent = '입력 중…';
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(saveNote, 700);
}

async function saveNote() {
  if (!state.currentNote) return;
  const payload = {
    title: $('note-title').value,
    content: mde.value(),
    notebookId: $('note-notebook').value || null,
    tags: $('note-tags').value.split(',').map((t) => t.trim()).filter(Boolean),
  };
  const updated = await api(`/notes/${state.currentNote.id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  state.currentNote = updated;
  $('save-status').textContent = '저장됨 · ' + formatTime(updated.updated_at);
  await loadNotes();
  await loadNotebooks();
  await loadTags();
}

// 제목/노트북/태그 변경도 자동저장 트리거
['note-title', 'note-notebook', 'note-tags'].forEach((id) =>
  $(id).addEventListener('input', scheduleSave)
);

$('delete-note-btn').addEventListener('click', async () => {
  if (!state.currentNote) return;
  if (!confirm('이 메모를 삭제할까요?')) return;
  await api(`/notes/${state.currentNote.id}`, { method: 'DELETE' });
  state.currentNote = null;
  $('editor-area').hidden = true;
  $('editor-empty').hidden = false;
  await loadNotes();
  await loadNotebooks();
  await loadTags();
});

/* ── 노트북 추가 ──────────────────────────── */
$('add-notebook-btn').addEventListener('click', async () => {
  const name = prompt('새 노트북 이름');
  if (!name || !name.trim()) return;
  await api('/notebooks', { method: 'POST', body: JSON.stringify({ name: name.trim() }) });
  await loadNotebooks();
});

/* ── 유틸 ─────────────────────────────────── */
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
function stripMarkdown(md) {
  return String(md ?? '')
    .replace(/[#*_`>\-\[\]!]/g, '')
    .replace(/\n+/g, ' ')
    .trim();
}
function formatDate(s) {
  const d = parseDbDate(s);
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
}
function formatTime(s) {
  const d = parseDbDate(s);
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}
// SQLite datetime('now')는 UTC 'YYYY-MM-DD HH:MM:SS' → 명시적으로 UTC로 해석
function parseDbDate(s) {
  if (!s) return new Date();
  return new Date(s.replace(' ', 'T') + 'Z');
}
function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/* ── 시작 ─────────────────────────────────── */
checkSession();
