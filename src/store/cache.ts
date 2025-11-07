import Database from 'better-sqlite3';
import { CACHE_PATH, ensureAppDir } from '../utils/paths';

export interface PRCache {
  owner: string;
  repo: string;
  prNumber: number;
  latestSha: string;
  myCommentAfterSha: boolean;
  lastCheckedAt: string;
}

export class CacheStore {
  private db: Database.Database;

  constructor() {
    ensureAppDir();
    this.db = new Database(CACHE_PATH);
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        status TEXT
      );

      CREATE TABLE IF NOT EXISTS pr_cache (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        pr_number INTEGER NOT NULL,
        latest_sha TEXT NOT NULL,
        my_comment_after_sha INTEGER NOT NULL,
        last_checked_at TEXT NOT NULL,
        PRIMARY KEY (owner, repo, pr_number)
      );

      CREATE INDEX IF NOT EXISTS idx_pr_cache_checked
        ON pr_cache(last_checked_at);
    `);
  }

  getPRCache(owner: string, repo: string, prNumber: number): PRCache | null {
    const row = this.db.prepare(`
      SELECT * FROM pr_cache
      WHERE owner = ? AND repo = ? AND pr_number = ?
    `).get(owner, repo, prNumber) as any;

    if (!row) return null;

    return {
      owner: row.owner,
      repo: row.repo,
      prNumber: row.pr_number,
      latestSha: row.latest_sha,
      myCommentAfterSha: row.my_comment_after_sha === 1,
      lastCheckedAt: row.last_checked_at
    };
  }

  setPRCache(cache: PRCache): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO pr_cache
        (owner, repo, pr_number, latest_sha, my_comment_after_sha, last_checked_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      cache.owner,
      cache.repo,
      cache.prNumber,
      cache.latestSha,
      cache.myCommentAfterSha ? 1 : 0,
      cache.lastCheckedAt
    );
  }

  markCommented(owner: string, repo: string, prNumber: number, sha: string): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO pr_cache
        (owner, repo, pr_number, latest_sha, my_comment_after_sha, last_checked_at)
      VALUES (?, ?, ?, ?, 1, ?)
    `).run(owner, repo, prNumber, sha, new Date().toISOString());
  }

  startRun(): number {
    const result = this.db.prepare(`
      INSERT INTO runs (started_at, status)
      VALUES (?, 'running')
    `).run(new Date().toISOString());

    return result.lastInsertRowid as number;
  }

  finishRun(runId: number, status: 'success' | 'error'): void {
    this.db.prepare(`
      UPDATE runs
      SET finished_at = ?, status = ?
      WHERE id = ?
    `).run(new Date().toISOString(), status, runId);
  }

  clear(): void {
    this.db.exec(`
      DELETE FROM pr_cache;
      DELETE FROM runs;
    `);
  }

  close(): void {
    this.db.close();
  }
}
