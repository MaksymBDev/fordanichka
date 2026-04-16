import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
dotenv.config();

export const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export async function initDB() {
  await db.batch([
    `CREATE TABLE IF NOT EXISTS transactions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      amount     REAL    NOT NULL,
      type       TEXT    NOT NULL CHECK(type IN ('income','expense')),
      category   TEXT    NOT NULL DEFAULT 'Другое',
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS plans (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      text       TEXT    NOT NULL,
      due_date   TEXT,
      done       INTEGER NOT NULL DEFAULT 0,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS ideas (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      text       TEXT    NOT NULL,
      tag        TEXT    NOT NULL DEFAULT '💡 Проект',
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS profile (
      id     INTEGER PRIMARY KEY DEFAULT 1,
      name   TEXT NOT NULL DEFAULT 'Моё лето',
      avatar TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS tasks (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      title      TEXT    NOT NULL,
      type       TEXT    NOT NULL DEFAULT 'task' CHECK(type IN ('task','daily','weekly')),
      completed  INTEGER NOT NULL DEFAULT 0,
      pinned     INTEGER NOT NULL DEFAULT 0,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS words (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      word_ro       TEXT    NOT NULL,
      word_ru       TEXT    NOT NULL,
      transcription TEXT,
      example       TEXT,
      topic         TEXT    NOT NULL DEFAULT 'Повседневное',
      pinned        INTEGER NOT NULL DEFAULT 0,
      learned       INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    )`,

    `INSERT OR IGNORE INTO profile (id, name) VALUES (1, 'Моё лето')`,
  ], 'write');

  // Миграция: добавляем pinned если колонки нет
  try {
    await db.execute('ALTER TABLE tasks ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0');
  } catch { /* колонка уже есть */ }

  // Миграция: добавляем pinned для ideas
  try {
    await db.execute('ALTER TABLE ideas ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0');
  } catch { /* колонка уже есть */ }

  console.log('✓ DB initialised');
}
