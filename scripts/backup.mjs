#!/usr/bin/env node
// Online SQLite backups using better-sqlite3's db.backup() API.
//
// Usage:
//   node scripts/backup.mjs          # loop forever, one backup every BACKUP_INTERVAL_MIN
//   node scripts/backup.mjs --once   # single backup, then exit (0 = ok, 1 = failure)
//
// Env:
//   DATABASE_URL         file:/app/data/dev.db (same as the app) — required
//   BACKUP_DIR            default /backups
//   BACKUP_INTERVAL_MIN    default 15
//   BACKUP_KEEP            default 96 (most recent interval backups to keep)
//
// Retention: keeps the newest BACKUP_KEEP interval backups, plus one backup
// per calendar day for the last 14 days (the newest backup of that day).
// Everything else is deleted after each run.
//
// Every run prints exactly one JSON line to stdout describing what happened.

import Database from "better-sqlite3";
import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { pipeline } from "node:stream/promises";

const DAILY_RETENTION_DAYS = 14;

function dbPathFromUrl(url) {
  if (!url) throw new Error("DATABASE_URL is not set");
  if (!url.startsWith("file:")) throw new Error(`DATABASE_URL must start with file: (got ${url})`);
  return url.slice("file:".length);
}

function tsStamp(d = new Date()) {
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
  );
}

function dayKeyFromName(name) {
  // dev-YYYYMMDD-HHMMSS.db.gz -> YYYYMMDD
  const m = name.match(/^dev-(\d{8})-\d{6}\.db\.gz$/);
  return m ? m[1] : null;
}

function dateFromName(name) {
  const m = name.match(/^dev-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.db\.gz$/);
  if (!m) return null;
  const [, y, mo, da, h, mi, s] = m;
  return new Date(Date.UTC(+y, +mo - 1, +da, +h, +mi, +s));
}

async function log(obj) {
  process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), ...obj }) + "\n");
}

async function integrityCheck(filePath) {
  const db = new Database(filePath, { readonly: true, fileMustExist: true });
  try {
    const row = db.prepare("PRAGMA integrity_check").get();
    return row && row.integrity_check === "ok";
  } finally {
    db.close();
  }
}

async function gzipFile(srcPath, destPath) {
  await pipeline(createReadStream(srcPath), zlib.createGzip({ level: 9 }), createWriteStream(destPath));
}

async function runRetention(backupDir, keepCount) {
  const entries = await fs.readdir(backupDir).catch(() => []);
  const backups = entries
    .filter((n) => /^dev-\d{8}-\d{6}\.db\.gz$/.test(n))
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)); // descending (newest first)

  const keep = new Set(backups.slice(0, keepCount));

  const now = Date.now();
  const seenDay = new Set();
  for (const name of backups) {
    const d = dateFromName(name);
    if (!d) continue;
    const ageDays = (now - d.getTime()) / 86400000;
    if (ageDays > DAILY_RETENTION_DAYS) continue;
    const dayKey = dayKeyFromName(name);
    if (!seenDay.has(dayKey)) {
      seenDay.add(dayKey);
      keep.add(name); // newest backup of that day (list is sorted desc)
    }
  }

  const removed = [];
  for (const name of backups) {
    if (!keep.has(name)) {
      await fs.rm(path.join(backupDir, name), { force: true });
      removed.push(name);
    }
  }
  return { kept: keep.size, removed: removed.length };
}

async function backupOnce({ srcPath, backupDir }) {
  const startedAt = Date.now();
  const stamp = tsStamp();
  const finalName = `dev-${stamp}.db.gz`;
  const tmpDbPath = path.join(backupDir, `dev-${stamp}.db.tmp`);
  const finalPath = path.join(backupDir, finalName);

  await fs.mkdir(backupDir, { recursive: true });

  let srcDb;
  try {
    srcDb = new Database(srcPath, { readonly: true, fileMustExist: true });
    await srcDb.backup(tmpDbPath);
  } finally {
    if (srcDb) srcDb.close();
  }

  const ok = await integrityCheck(tmpDbPath);
  if (!ok) {
    await fs.rm(tmpDbPath, { force: true });
    await fs.rm(`${tmpDbPath}-shm`, { force: true });
    await fs.rm(`${tmpDbPath}-wal`, { force: true });
    throw new Error("integrity_check failed on backup copy");
  }

  await gzipFile(tmpDbPath, finalPath);
  const stat = await fs.stat(finalPath);
  await fs.rm(tmpDbPath, { force: true });
  // The backup destination inherits WAL mode from the source page header,
  // so SQLite may leave -shm/-wal siblings next to the temp copy even
  // after the backup handle is closed. Clean them up too.
  await fs.rm(`${tmpDbPath}-shm`, { force: true });
  await fs.rm(`${tmpDbPath}-wal`, { force: true });

  return {
    file: finalName,
    sizeBytes: stat.size,
    durationMs: Date.now() - startedAt,
  };
}

async function main() {
  const once = process.argv.includes("--once");
  const srcPath = dbPathFromUrl(process.env.DATABASE_URL);
  const backupDir = process.env.BACKUP_DIR || "/backups";
  const intervalMin = Number(process.env.BACKUP_INTERVAL_MIN || 15);
  const keepCount = Number(process.env.BACKUP_KEEP || 96);

  async function tick() {
    try {
      const result = await backupOnce({ srcPath, backupDir });
      const retention = await runRetention(backupDir, keepCount);
      await log({ event: "backup", ok: true, ...result, retention });
      return true;
    } catch (err) {
      await log({ event: "backup", ok: false, error: String(err && err.message ? err.message : err) });
      return false;
    }
  }

  if (once) {
    const ok = await tick();
    process.exit(ok ? 0 : 1);
  }

  await log({ event: "start", intervalMin, backupDir, keepCount });
  // Run immediately, then every intervalMin.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await tick();
    await new Promise((r) => setTimeout(r, intervalMin * 60 * 1000));
  }
}

main().catch(async (err) => {
  await log({ event: "fatal", error: String(err && err.stack ? err.stack : err) });
  process.exit(1);
});
