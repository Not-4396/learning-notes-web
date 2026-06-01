const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'learning-notes.db');

let db = null;

async function initDB() {
  const SQL = await initSqlJs();

  // 确保 data 目录存在
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // 如果数据库文件存在，读取它
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // 创建表
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      nickname TEXT,
      avatar_url TEXT,
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
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
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
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, date_key),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS generate_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date_key TEXT NOT NULL,
      status TEXT DEFAULT 'processing',
      result TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
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
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 创建索引
  db.run('CREATE INDEX IF NOT EXISTS idx_conversations_user_date ON conversations(user_id, date_key)');
  db.run('CREATE INDEX IF NOT EXISTS idx_daily_summaries_user ON daily_summaries(user_id, date_key)');
  db.run('CREATE INDEX IF NOT EXISTS idx_share_links_token ON share_links(share_token)');

  saveDB();
  console.log('Database initialized');
  return db;
}

function saveDB() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

function getDB() {
  if (!db) throw new Error('Database not initialized');
  return db;
}

// 每 30 秒自动保存一次
setInterval(() => {
  saveDB();
}, 30000);

module.exports = { initDB, getDB, saveDB };
