import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import type { Article } from "./types";

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "articles.db");

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS articles (
      guid         TEXT PRIMARY KEY,
      source       TEXT NOT NULL,
      title        TEXT NOT NULL,
      summary      TEXT,
      link         TEXT NOT NULL,
      published_at INTEGER NOT NULL,
      fetched_at   INTEGER NOT NULL,
      title_ko     TEXT,
      summary_ko   TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at DESC);
    CREATE INDEX IF NOT EXISTS idx_articles_source ON articles(source);
  `);
  _db = db;
  return db;
}

export function upsertArticles(rows: Omit<Article, "title_ko" | "summary_ko">[]): number {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO articles (guid, source, title, summary, link, published_at, fetched_at)
    VALUES (@guid, @source, @title, @summary, @link, @published_at, @fetched_at)
    ON CONFLICT(guid) DO UPDATE SET
      title       = excluded.title,
      summary     = excluded.summary,
      link        = excluded.link,
      fetched_at  = excluded.fetched_at
  `);
  const tx = db.transaction((items: typeof rows) => {
    let inserted = 0;
    for (const r of items) {
      const info = stmt.run(r);
      inserted += info.changes;
    }
    return inserted;
  });
  return tx(rows);
}

export function listArticles(opts: { source?: string; limit?: number } = {}): Article[] {
  const db = getDb();
  const limit = Math.min(opts.limit ?? 200, 500);
  if (opts.source) {
    return db
      .prepare(
        `SELECT * FROM articles WHERE source = ? ORDER BY published_at DESC LIMIT ?`
      )
      .all(opts.source, limit) as Article[];
  }
  return db
    .prepare(`SELECT * FROM articles ORDER BY published_at DESC LIMIT ?`)
    .all(limit) as Article[];
}

export function getUntranslated(guids: string[]): Article[] {
  if (guids.length === 0) return [];
  const db = getDb();
  const placeholders = guids.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT * FROM articles WHERE title_ko IS NULL AND guid IN (${placeholders})`
    )
    .all(...guids) as Article[];
}

export function saveTranslations(items: { guid: string; title_ko: string; summary_ko: string }[]) {
  const db = getDb();
  const stmt = db.prepare(
    `UPDATE articles SET title_ko = ?, summary_ko = ? WHERE guid = ?`
  );
  const tx = db.transaction((rows: typeof items) => {
    for (const r of rows) stmt.run(r.title_ko, r.summary_ko, r.guid);
  });
  tx(items);
}

export function getArticles(guids: string[]): Article[] {
  if (guids.length === 0) return [];
  const db = getDb();
  const placeholders = guids.map(() => "?").join(",");
  return db
    .prepare(`SELECT * FROM articles WHERE guid IN (${placeholders})`)
    .all(...guids) as Article[];
}
