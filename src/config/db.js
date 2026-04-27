const Database = require('better-sqlite3');
const path = require('path');
const fs   = require('fs');
require('dotenv').config();
const DB_PATH = process.env.DB_PATH || './data/hawoenim.db';
const dir = path.dirname(path.resolve(DB_PATH));
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
const db = new Database(path.resolve(DB_PATH));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
  -- ── 사용자 (슈퍼관리자 + 유치원관리자 통합) ──────────────────
  CREATE TABLE IF NOT EXISTS users (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    username         TEXT    NOT NULL UNIQUE,
    password         TEXT    NOT NULL,
    email            TEXT,
    name             TEXT    DEFAULT '관리자',
    role             TEXT    NOT NULL DEFAULT 'kg_admin',
    -- role: 'super' | 'kg_admin'
    kindergarten_id  INTEGER REFERENCES kindergartens(id) ON DELETE SET NULL,
    created_at       TEXT    DEFAULT (datetime('now','localtime'))
  );
  -- ── 유치원 ────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS kindergartens (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL,
    director     TEXT,
    phone        TEXT,
    address      TEXT,
    status       TEXT    DEFAULT 'active',
    created_at   TEXT    DEFAULT (datetime('now','localtime'))
  );
  -- ── 반(교실) ───────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS classrooms (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    kindergarten_id  INTEGER NOT NULL REFERENCES kindergartens(id) ON DELETE CASCADE,
    name             TEXT    NOT NULL,
    emoji            TEXT    DEFAULT '🏫',
    teacher          TEXT,
    created_at       TEXT    DEFAULT (datetime('now','localtime'))
  );
  -- ── 원생 ──────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS students (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    classroom_id INTEGER NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
    name         TEXT    NOT NULL,
    age          TEXT,
    emoji        TEXT    DEFAULT '🧒',
    created_at   TEXT    DEFAULT (datetime('now','localtime'))
  );
  -- ── 가족(보호자) ───────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS family_members (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id   INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    name         TEXT    NOT NULL,
    relation     TEXT    NOT NULL,
    phone        TEXT    NOT NULL,
    notify_type  TEXT    DEFAULT '예약 알림 수신',
    created_at   TEXT    DEFAULT (datetime('now','localtime'))
  );
  -- ── 방송 설정 ─────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS broadcast_settings (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    kindergarten_id  INTEGER REFERENCES kindergartens(id) ON DELETE CASCADE,
    classroom_id     INTEGER REFERENCES classrooms(id) ON DELETE CASCADE,
    notice_minutes   INTEGER DEFAULT 10,
    start            TEXT    DEFAULT '14:00',
    end_time         TEXT    DEFAULT '17:00',
    gap              INTEGER DEFAULT 30,
    times            TEXT,
    default_ment     TEXT    DEFAULT '{반} {이름} 학부모님, 하원 준비해 주세요',
    updated_at       TEXT    DEFAULT (datetime('now','localtime'))
  );
  -- ── 하원 예약 ─────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS reservations (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id   INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    pickup_time  TEXT    NOT NULL,
    reserve_date TEXT    NOT NULL,
    status       TEXT    DEFAULT 'pending',
    created_at   TEXT    DEFAULT (datetime('now','localtime')),
    announced_at TEXT
  );
  -- ── 방송 로그 ─────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS broadcast_logs (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    kindergarten_id  INTEGER REFERENCES kindergartens(id),
    reservation_id   INTEGER REFERENCES reservations(id),
    student_name     TEXT,
    classroom_name   TEXT,
    ment             TEXT,
    type             TEXT    DEFAULT 'auto',
    result           TEXT    DEFAULT 'success',
    created_at       TEXT    DEFAULT (datetime('now','localtime'))
  );
`);
// 기존 DB 마이그레이션 - broadcast_settings 컬럼 추가
try { db.exec("ALTER TABLE broadcast_settings ADD COLUMN start TEXT DEFAULT '14:00'"); } catch(e) {}
try { db.exec("ALTER TABLE broadcast_settings ADD COLUMN end_time TEXT DEFAULT '17:00'"); } catch(e) {}
try { db.exec("ALTER TABLE broadcast_settings ADD COLUMN gap INTEGER DEFAULT 30"); } catch(e) {}
try { db.exec("ALTER TABLE broadcast_settings ADD COLUMN times TEXT"); } catch(e) {}
module.exports = db;
