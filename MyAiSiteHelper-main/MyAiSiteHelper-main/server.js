import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import path from 'path';
import { db, initDB } from './db.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors({
  origin: '*',
  credentials: false,
}));

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

await initDB();

// ── Auth middleware ─────────────────────────────────────────
function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(h.slice(7), process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ══════════════════════════════════════════════════
// LOGIN
// ══════════════════════════════════════════════════
app.post('/api/login', async (req, res) => {
  try {
    const { login, password } = req.body;

    if (login !== process.env.DASHBOARD_LOGIN) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    const ok = await bcrypt.compare(password, process.env.DASHBOARD_PASS_HASH);
    if (!ok) return res.status(401).json({ error: 'Неверный логин или пароль' });

    const token = jwt.sign({ user: 'owner' }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ token });
  } catch (e) {
    console.error('Login error:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ══════════════════════════════════════════════════
// PROFILE
// ══════════════════════════════════════════════════
app.get('/api/profile', auth, async (req, res) => {
  try {
    const r = await db.execute('SELECT * FROM profile WHERE id = 1');
    const row = r.rows[0];
    res.json({ name: row?.name || 'Моё лето', avatar: row?.avatar || null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

app.put('/api/profile', auth, async (req, res) => {
  try {
    const { name, avatar } = req.body;
    await db.execute({
      sql: 'UPDATE profile SET name = ?, avatar = ? WHERE id = 1',
      args: [name || 'Моё лето', avatar || null],
    });
    res.json({ name, avatar });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

// ══════════════════════════════════════════════════
// TRANSACTIONS
// ══════════════════════════════════════════════════
app.get('/api/transactions', auth, async (req, res) => {
  try {
    const r = await db.execute('SELECT * FROM transactions ORDER BY created_at DESC LIMIT 200');
    res.json(r.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

app.post('/api/transactions', auth, async (req, res) => {
  try {
    const { name, amount, type, category } = req.body;
    if (!name || !amount || !type) return res.status(400).json({ error: 'Missing fields' });

    const r = await db.execute({
      sql: 'INSERT INTO transactions (name, amount, type, category) VALUES (?, ?, ?, ?)',
      args: [name, amount, type, category || 'Другое'],
    });
    const row = await db.execute({ sql: 'SELECT * FROM transactions WHERE id = ?', args: [r.lastInsertRowid] });
    res.status(201).json(row.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

app.delete('/api/transactions/:id', auth, async (req, res) => {
  try {
    await db.execute({ sql: 'DELETE FROM transactions WHERE id = ?', args: [req.params.id] });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

// ══════════════════════════════════════════════════
// PLANS
// ══════════════════════════════════════════════════
app.get('/api/plans', auth, async (req, res) => {
  try {
    const r = await db.execute('SELECT * FROM plans ORDER BY created_at DESC');
    res.json(r.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

app.post('/api/plans', auth, async (req, res) => {
  try {
    const { text, due_date } = req.body;
    if (!text) return res.status(400).json({ error: 'Missing text' });

    const r = await db.execute({
      sql: 'INSERT INTO plans (text, due_date) VALUES (?, ?)',
      args: [text, due_date || null],
    });
    const row = await db.execute({ sql: 'SELECT * FROM plans WHERE id = ?', args: [r.lastInsertRowid] });
    res.status(201).json(row.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

app.patch('/api/plans/:id', auth, async (req, res) => {
  try {
    const { done, text } = req.body;
    const updates = [];
    const args = [];
    if (done !== undefined) { updates.push('done = ?'); args.push(done ? 1 : 0); }
    if (text !== undefined) { updates.push('text = ?'); args.push(text); }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    args.push(req.params.id);
    await db.execute({ sql: `UPDATE plans SET ${updates.join(', ')} WHERE id = ?`, args });
    const row = await db.execute({ sql: 'SELECT * FROM plans WHERE id = ?', args: [req.params.id] });
    res.json(row.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

app.delete('/api/plans/:id', auth, async (req, res) => {
  try {
    await db.execute({ sql: 'DELETE FROM plans WHERE id = ?', args: [req.params.id] });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

// ══════════════════════════════════════════════════
// IDEAS
// ══════════════════════════════════════════════════
app.get('/api/ideas', auth, async (req, res) => {
  try {
    const r = await db.execute('SELECT * FROM ideas ORDER BY created_at DESC');
    res.json(r.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

app.post('/api/ideas', auth, async (req, res) => {
  try {
    const { text, tag } = req.body;
    if (!text) return res.status(400).json({ error: 'Missing text' });

    const r = await db.execute({
      sql: 'INSERT INTO ideas (text, tag) VALUES (?, ?)',
      args: [text, tag || '💡 Проект'],
    });
    const row = await db.execute({ sql: 'SELECT * FROM ideas WHERE id = ?', args: [r.lastInsertRowid] });
    res.status(201).json(row.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

app.patch('/api/ideas/:id', auth, async (req, res) => {
  try {
    const { pinned, text, tag } = req.body;
    const updates = [];
    const args = [];
    if (pinned !== undefined) { updates.push('pinned = ?'); args.push(pinned ? 1 : 0); }
    if (text !== undefined) { updates.push('text = ?'); args.push(text); }
    if (tag !== undefined) { updates.push('tag = ?'); args.push(tag); }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    args.push(req.params.id);
    await db.execute({ sql: `UPDATE ideas SET ${updates.join(', ')} WHERE id = ?`, args });
    const row = await db.execute({ sql: 'SELECT * FROM ideas WHERE id = ?', args: [req.params.id] });
    res.json(row.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

app.delete('/api/ideas/:id', auth, async (req, res) => {
  try {
    await db.execute({ sql: 'DELETE FROM ideas WHERE id = ?', args: [req.params.id] });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

// ══════════════════════════════════════════════════
// TASKS (трекер)
// ══════════════════════════════════════════════════
app.get('/api/tasks', auth, async (req, res) => {
  try {
    const r = await db.execute('SELECT * FROM tasks ORDER BY created_at DESC');
    res.json(r.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

app.post('/api/tasks', auth, async (req, res) => {
  try {
    const { title, type } = req.body;
    if (!title) return res.status(400).json({ error: 'Missing title' });

    const r = await db.execute({
      sql: 'INSERT INTO tasks (title, type) VALUES (?, ?)',
      args: [title, type || 'task'],
    });
    const row = await db.execute({ sql: 'SELECT * FROM tasks WHERE id = ?', args: [r.lastInsertRowid] });
    res.status(201).json(row.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

app.put('/api/tasks/:id', auth, async (req, res) => {
  try {
    const { completed, title, pinned } = req.body;
    const updates = [];
    const args = [];
    if (completed !== undefined) { updates.push('completed = ?'); args.push(completed ? 1 : 0); }
    if (title !== undefined) { updates.push('title = ?'); args.push(title); }
    if (pinned !== undefined) { updates.push('pinned = ?'); args.push(pinned ? 1 : 0); }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    args.push(req.params.id);
    await db.execute({ sql: `UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`, args });
    const row = await db.execute({ sql: 'SELECT * FROM tasks WHERE id = ?', args: [req.params.id] });
    res.json(row.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

app.delete('/api/tasks/:id', auth, async (req, res) => {
  try {
    await db.execute({ sql: 'DELETE FROM tasks WHERE id = ?', args: [req.params.id] });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

// ══════════════════════════════════════════════════
// AI CHAT
// ══════════════════════════════════════════════════
app.post('/api/chat', auth, async (req, res) => {
  try {
    const { messages } = req.body;
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OPENAI_API_KEY not set' });
    }
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Ты личный ассистент. Отвечай по-русски, честно и кратко.' },
          ...messages,
        ],
        max_tokens: 1000,
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: err.error?.message || 'OpenAI error' });
    }
    const data = await response.json();
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════
// WORDS (румынский)
// ══════════════════════════════════════════════════
app.get('/api/words', auth, async (req, res) => {
  try {
    const r = await db.execute('SELECT * FROM words ORDER BY created_at DESC');
    res.json(r.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

app.post('/api/words', auth, async (req, res) => {
  try {
    const { word_ro, word_ru, transcription, example, topic } = req.body;
    if (!word_ro || !word_ru) return res.status(400).json({ error: 'Missing fields' });
    const r = await db.execute({
      sql: 'INSERT INTO words (word_ro, word_ru, transcription, example, topic) VALUES (?, ?, ?, ?, ?)',
      args: [word_ro, word_ru, transcription || null, example || null, topic || 'Повседневное'],
    });
    const row = await db.execute({ sql: 'SELECT * FROM words WHERE id = ?', args: [r.lastInsertRowid] });
    res.status(201).json(row.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

app.patch('/api/words/:id', auth, async (req, res) => {
  try {
    const { pinned, learned } = req.body;
    const updates = [];
    const args = [];
    if (pinned !== undefined) { updates.push('pinned = ?'); args.push(pinned ? 1 : 0); }
    if (learned !== undefined) { updates.push('learned = ?'); args.push(learned ? 1 : 0); }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    args.push(req.params.id);
    await db.execute({ sql: `UPDATE words SET ${updates.join(', ')} WHERE id = ?`, args });
    const row = await db.execute({ sql: 'SELECT * FROM words WHERE id = ?', args: [req.params.id] });
    res.json(row.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

app.delete('/api/words/:id', auth, async (req, res) => {
  try {
    await db.execute({ sql: 'DELETE FROM words WHERE id = ?', args: [req.params.id] });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

// ── SPA fallback ────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✓ Server running on http://localhost:${PORT}`));
