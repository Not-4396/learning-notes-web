const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDB } = require('./services/db');
const { authMiddleware } = require('./middleware/auth');

const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const summaryRoutes = require('./routes/summary');
const reportRoutes = require('./routes/report');
const importRoutes = require('./routes/import');

const app = express();
const PORT = process.env.PORT || 3003;

// 中间件
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'https://learning-notes-client.onrender.com'
  ],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// 静态文件（生产环境）
app.use(express.static(path.join(__dirname, '../client/dist')));

// 公开路由
app.use('/api/auth', authRoutes);

// 分享查看（不需要登录）
app.get('/api/report/shared/:token', (req, res, next) => {
  // 从 report 路由中提取分享查看的处理
  const { getDB } = require('./services/db');
  try {
    const { token } = req.params;
    const db = getDB();

    const linkResult = db.exec(`
      SELECT date_key, expires_at, view_count FROM share_links WHERE share_token = ?
    `, [token]);

    if (linkResult.length === 0 || linkResult[0].values.length === 0) {
      return res.json({ ok: false, error: '分享链接无效' });
    }

    const [dateKey, expiresAt, viewCount] = linkResult[0].values[0];

    if (new Date(expiresAt) < new Date()) {
      return res.json({ ok: false, error: '分享链接已过期' });
    }

    db.run('UPDATE share_links SET view_count = view_count + 1 WHERE share_token = ?', [token]);

    const summaryResult = db.exec(`
      SELECT tree, topic_count, total_turns FROM daily_summaries WHERE share_token = ?
    `, [token]);

    if (summaryResult.length === 0 || summaryResult[0].values.length === 0) {
      return res.json({ ok: false, error: '笔记不存在' });
    }

    const [tree, topicCount, totalTurns] = summaryResult[0].values[0];
    const { saveDB } = require('./services/db');
    saveDB();

    res.json({
      ok: true,
      data: { date_key: dateKey, tree: tree ? JSON.parse(tree) : null, topic_count: topicCount, total_turns: totalTurns }
    });
  } catch (err) {
    console.error('get shared report error:', err);
    res.json({ ok: false, error: '查看分享失败' });
  }
});

// 需要登录的路由
app.get('/api/auth/me', authMiddleware, (req, res) => {
  try {
    const db = getDB();
    const result = db.exec(
      'SELECT id, username, nickname, avatar_url FROM users WHERE id = ?',
      [req.userId]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return res.json({ ok: false, error: '用户不存在' });
    }

    const [id, username, nickname, avatarUrl] = result[0].values[0];
    res.json({ ok: true, user: { id, username, nickname, avatarUrl } });
  } catch (err) {
    console.error('get user error:', err);
    res.json({ ok: false, error: '获取用户信息失败' });
  }
});

app.use('/api/chat', authMiddleware, chatRoutes);
app.use('/api/summary', authMiddleware, summaryRoutes);
app.use('/api/report', authMiddleware, reportRoutes);
app.use('/api/import', authMiddleware, importRoutes);

// SPA 回退（生产环境）
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  } else {
    res.status(404).json({ ok: false, error: '接口不存在' });
  }
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ ok: false, error: '服务器错误' });
});

// 启动服务
async function start() {
  try {
    await initDB();
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
