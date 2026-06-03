-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nickname TEXT,
  last_login DATETIME
);

-- 对话表
CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  reply TEXT,
  date_key TEXT NOT NULL,
  source TEXT DEFAULT 'chat',
  replied INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 每日总结表
CREATE TABLE IF NOT EXISTS daily_summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  date_key TEXT NOT NULL,
  tree TEXT,
  topic_count INTEGER DEFAULT 0,
  total_turns INTEGER DEFAULT 0,
  share_token TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 生成任务表
CREATE TABLE IF NOT EXISTS generate_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  date_key TEXT NOT NULL,
  status TEXT DEFAULT 'processing',
  result TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 分享链接表
CREATE TABLE IF NOT EXISTS share_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  share_token TEXT UNIQUE NOT NULL,
  date_key TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  expires_at DATETIME NOT NULL,
  view_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 用户分数表
CREATE TABLE IF NOT EXISTS user_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  category TEXT NOT NULL,
  score INTEGER DEFAULT 0,
  question_count INTEGER DEFAULT 0,
  recent_depths TEXT DEFAULT '[]',
  streak_days INTEGER DEFAULT 0,
  last_study_date TEXT,
  weekly_active_days TEXT DEFAULT '[]',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(user_id, category)
);

-- 每日分类计数表
CREATE TABLE IF NOT EXISTS daily_category_count (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  category TEXT NOT NULL,
  date_key TEXT NOT NULL,
  count INTEGER DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(user_id, category, date_key)
);
