const initSqlJs = require('sql.js');

let db = null;

async function initDB() {
  const SQL = await initSqlJs();
  db = new SQL.Database();

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      nickname TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      last_login TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      reply TEXT,
      replied INTEGER DEFAULT 0,
      date_key TEXT NOT NULL,
      source TEXT DEFAULT 'chat',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS daily_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date_key TEXT NOT NULL,
      tree TEXT,
      topic_count INTEGER DEFAULT 0,
      total_turns INTEGER DEFAULT 0,
      share_token TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS generate_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date_key TEXT NOT NULL,
      status TEXT DEFAULT 'processing',
      result TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS share_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      share_token TEXT UNIQUE NOT NULL,
      date_key TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      view_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_conversations_user_date ON conversations(user_id, date_key)');
  db.run('CREATE INDEX IF NOT EXISTS idx_daily_summaries_user ON daily_summaries(user_id, date_key)');

  console.log('Database initialized');
  return db;
}

function saveDB() {
  // Serverless 环境中不需要持久化
}

function getDB() {
  if (!db) throw new Error('Database not initialized');
  return db;
}

module.exports = { initDB, getDB, saveDB };
