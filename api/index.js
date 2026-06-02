// Vercel Serverless Function 入口
const express = require('express');
const cors = require('cors');
const { initDB, getDB, saveDB } = require('./services/db');
const { authMiddleware, generateToken } = require('./middleware/auth');
const bcrypt = require('bcryptjs');

const app = express();

app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// 初始化数据库
let dbReady = false;

async function ensureDB() {
  if (!dbReady) {
    await initDB();
    dbReady = true;
  }
}

// 注册
app.post('/api/auth/register', async (req, res) => {
  try {
    await ensureDB();
    const { username, password, nickname } = req.body;

    if (!username || !password) {
      return res.json({ ok: false, error: '用户名和密码不能为空' });
    }

    const db = getDB();
    const existing = db.exec('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length > 0 && existing[0].values.length > 0) {
      return res.json({ ok: false, error: '用户名已存在' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    db.run('INSERT INTO users (username, password_hash, nickname) VALUES (?, ?, ?)', [username, passwordHash, nickname || username]);
    saveDB();

    const result = db.exec('SELECT last_insert_rowid() as id');
    const userId = result[0].values[0][0];
    const token = generateToken(userId, username);

    res.json({ ok: true, token, user: { id: userId, username, nickname: nickname || username } });
  } catch (err) {
    console.error('register error:', err);
    res.json({ ok: false, error: '注册失败' });
  }
});

// 登录
app.post('/api/auth/login', async (req, res) => {
  try {
    await ensureDB();
    const { username, password } = req.body;

    if (!username || !password) {
      return res.json({ ok: false, error: '用户名和密码不能为空' });
    }

    const db = getDB();
    const result = db.exec('SELECT id, username, password_hash, nickname FROM users WHERE username = ?', [username]);

    if (result.length === 0 || result[0].values.length === 0) {
      return res.json({ ok: false, error: '用户名或密码错误' });
    }

    const [id, usernameDb, passwordHash, nickname] = result[0].values[0];

    if (!bcrypt.compareSync(password, passwordHash)) {
      return res.json({ ok: false, error: '用户名或密码错误' });
    }

    db.run('UPDATE users SET last_login = datetime("now") WHERE id = ?', [id]);
    saveDB();

    const token = generateToken(id, usernameDb);
    res.json({ ok: true, token, user: { id, username: usernameDb, nickname } });
  } catch (err) {
    console.error('login error:', err);
    res.json({ ok: false, error: '登录失败' });
  }
});

// 发送消息
app.post('/api/chat/send', authMiddleware, async (req, res) => {
  try {
    await ensureDB();
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.json({ ok: false, error: '消息不能为空' });
    }

    const db = getDB();
    const dateKey = new Date().toISOString().slice(0, 10);

    db.run("INSERT INTO conversations (user_id, role, content, date_key, source) VALUES (?, 'user', ?, ?, 'chat')", [req.userId, message.trim(), dateKey]);
    saveDB();

    const result = db.exec('SELECT last_insert_rowid() as id');
    const msgId = result[0].values[0][0];

    // 获取历史对话
    const historyResult = db.exec('SELECT role, content, reply FROM conversations WHERE user_id = ? AND source = \'chat\' ORDER BY created_at DESC LIMIT 4', [req.userId]);

    const history = [];
    if (historyResult.length > 0) {
      for (const [role, content, reply] of historyResult[0].values.reverse()) {
        if (role === 'user') {
          history.push({ role: 'user', content });
          if (reply) history.push({ role: 'assistant', content: reply });
        }
      }
    }

    const messages = [
      { role: 'system', content: '你是AI学习助手，用简洁中文回答，控制在300字内。支持Markdown格式。' },
      ...history,
      { role: 'user', content: message.trim() }
    ];

    // 调用 MIMO API
    const https = require('https');
    const MIMO_API_KEY = process.env.MIMO_API_KEY;
    const MIMO_API_URL = 'https://token-plan-cn.xiaomimimo.com/v1/chat/completions';

    const body = JSON.stringify({
      model: 'mimo-v2.5',
      max_tokens: 800,
      temperature: 0.7,
      messages
    });

    const reply = await new Promise((resolve, reject) => {
      const url = new URL(MIMO_API_URL);
      const req = https.request({
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        timeout: 50000,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + MIMO_API_KEY
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.choices && json.choices[0]) {
              const message = json.choices[0].message;
              resolve(message.content || message.reasoning_content || '');
            } else {
              reject(new Error('Invalid API response'));
            }
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('timeout', () => { req.destroy(); reject(new Error('API timeout')); });
      req.on('error', reject);
      req.write(body);
      req.end();
    });

    db.run('UPDATE conversations SET reply = ?, replied = 1 WHERE id = ?', [reply, msgId]);
    db.run("INSERT INTO conversations (user_id, role, content, date_key, source, replied) VALUES (?, 'assistant', ?, ?, 'chat', 1)", [req.userId, reply, dateKey]);
    saveDB();

    res.json({ ok: true, reply, msgId });
  } catch (err) {
    console.error('send message error:', err);
    res.json({ ok: false, error: '发送消息失败: ' + err.message });
  }
});

// 获取历史对话
app.get('/api/chat/history', authMiddleware, async (req, res) => {
  try {
    await ensureDB();
    const limit = parseInt(req.query.limit) || 50;
    const db = getDB();

    const result = db.exec('SELECT role, content, reply FROM conversations WHERE user_id = ? AND source = \'chat\' AND replied = 1 ORDER BY created_at DESC LIMIT ?', [req.userId, limit]);

    if (result.length === 0) {
      return res.json({ ok: true, messages: [] });
    }

    const messages = [];
    for (const [role, content, reply] of result[0].values.reverse()) {
      if (role === 'user' && reply) {
        messages.push({ role: 'user', content });
        messages.push({ role: 'assistant', content: reply });
      }
    }

    res.json({ ok: true, messages });
  } catch (err) {
    console.error('get history error:', err);
    res.json({ ok: false, error: '获取历史对话失败' });
  }
});

// 生成笔记
app.post('/api/summary/generate', authMiddleware, async (req, res) => {
  try {
    await ensureDB();
    const { date_key } = req.body;

    if (!date_key) {
      return res.json({ ok: false, error: '日期不能为空' });
    }

    const db = getDB();
    const maxIdResult = db.exec('SELECT MAX(id) as max_id FROM generate_tasks');
    const nextId = (maxIdResult[0]?.values[0][0] || 0) + 1;

    db.run("INSERT INTO generate_tasks (id, user_id, date_key, status) VALUES (?, ?, ?, 'processing')", [nextId, req.userId, date_key]);
    saveDB();

    // 异步处理（Vercel 会等待响应完成）
    const convResult = db.exec('SELECT role, content FROM conversations WHERE user_id = ? AND date_key = ? ORDER BY created_at ASC LIMIT 50', [req.userId, date_key]);

    if (convResult.length === 0 || convResult[0].values.length === 0) {
      db.run('UPDATE generate_tasks SET status = \'error\', result = ? WHERE id = ?', [JSON.stringify({ error: '没有对话记录' }), nextId]);
      saveDB();
      return res.json({ ok: true, task_id: nextId });
    }

    let text = '';
    for (const [role, content] of convResult[0].values) {
      const prefix = role === 'user' ? '用户' : 'AI';
      const truncated = content.length > 1500 ? content.slice(0, 1500) + '...' : content;
      text += `[${prefix}]: ${truncated}\n\n`;
    }

    if (text.length > 15000) text = text.slice(0, 15000) + '\n...[已截断]';

    const prompt = `将以下对话整理成知识树JSON：
{
  "id": "root",
  "label": "${date_key} 学习笔记",
  "children": [
    {
      "id": "t1",
      "label": "主题名",
      "summary": "一句话总结",
      "children": [
        {
          "id": "s1",
          "label": "核心概念",
          "summary": "概念说明",
          "children": [
            {"id": "d1", "label": "细节要点", "detail": "具体说明"}
          ]
        }
      ]
    }
  ]
}
规则：提取学习知识点，最多4层，中文标签，只输出JSON。`;

    const https = require('https');
    const MIMO_API_KEY = process.env.MIMO_API_KEY;
    const MIMO_API_URL = 'https://token-plan-cn.xiaomimimo.com/v1/chat/completions';

    const apiBody = JSON.stringify({
      model: 'mimo-v2.5',
      max_tokens: 4096,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: text }
      ]
    });

    const reply = await new Promise((resolve, reject) => {
      const url = new URL(MIMO_API_URL);
      const req = https.request({
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        timeout: 50000,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + MIMO_API_KEY
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.choices && json.choices[0]) {
              const message = json.choices[0].message;
              resolve(message.content || message.reasoning_content || '');
            } else {
              reject(new Error('Invalid API response'));
            }
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('timeout', () => { req.destroy(); reject(new Error('API timeout')); });
      req.on('error', reject);
      req.write(apiBody);
      req.end();
    });

    // 解析 JSON
    let tree;
    try {
      tree = JSON.parse(reply);
    } catch (e) {
      try {
        const match = reply.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (match) {
          tree = JSON.parse(match[1].trim());
        } else {
          let fixedReply = reply;
          const lastComplete = fixedReply.lastIndexOf('}');
          if (lastComplete > 0) {
            fixedReply = fixedReply.slice(0, lastComplete + 1);
            const openBraces = (fixedReply.match(/{/g) || []).length;
            const closeBraces = (fixedReply.match(/}/g) || []).length;
            const openBrackets = (fixedReply.match(/\[/g) || []).length;
            const closeBrackets = (fixedReply.match(/]/g) || []).length;
            for (let i = 0; i < openBrackets - closeBrackets; i++) fixedReply += ']';
            for (let i = 0; i < openBraces - closeBraces; i++) fixedReply += '}';
            tree = JSON.parse(fixedReply);
          } else {
            tree = { id: 'root', label: date_key, children: [] };
          }
        }
      } catch (e2) {
        tree = { id: 'root', label: date_key, children: [] };
      }
    }

    const topicCount = tree.children ? tree.children.length : 0;
    const convCount = convResult[0].values.length;

    const existingResult = db.exec('SELECT id FROM daily_summaries WHERE user_id = ? AND date_key = ?', [req.userId, date_key]);

    if (existingResult.length > 0 && existingResult[0].values.length > 0) {
      const summaryId = existingResult[0].values[0][0];
      db.run('UPDATE daily_summaries SET tree = ?, topic_count = ?, total_turns = ?, updated_at = datetime(\'now\') WHERE id = ?', [JSON.stringify(tree), topicCount, convCount, summaryId]);
    } else {
      db.run('INSERT INTO daily_summaries (user_id, date_key, tree, topic_count, total_turns) VALUES (?, ?, ?, ?, ?)', [req.userId, date_key, JSON.stringify(tree), topicCount, convCount]);
    }

    db.run('UPDATE generate_tasks SET status = \'done\', result = ? WHERE id = ?', [JSON.stringify({ topic_count: topicCount }), nextId]);
    saveDB();

    res.json({ ok: true, task_id: nextId });
  } catch (err) {
    console.error('generate error:', err);
    res.json({ ok: false, error: '生成失败: ' + err.message });
  }
});

// 查询生成状态
app.get('/api/summary/poll/:taskId', authMiddleware, async (req, res) => {
  try {
    await ensureDB();
    const { taskId } = req.params;
    const db = getDB();

    const result = db.exec('SELECT status, result FROM generate_tasks WHERE id = ? AND user_id = ?', [taskId, req.userId]);

    if (result.length === 0 || result[0].values.length === 0) {
      return res.json({ ok: false, error: '任务不存在' });
    }

    const [status, resultStr] = result[0].values[0];
    const resultData = resultStr ? JSON.parse(resultStr) : null;

    res.json({ ok: true, status, result: resultData });
  } catch (err) {
    console.error('poll error:', err);
    res.json({ ok: false, error: '查询状态失败' });
  }
});

// 获取笔记列表
app.get('/api/report/list', authMiddleware, async (req, res) => {
  try {
    await ensureDB();
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    const offset = (page - 1) * pageSize;
    const db = getDB();

    const result = db.exec('SELECT date_key, tree, topic_count, total_turns, updated_at FROM daily_summaries WHERE user_id = ? ORDER BY date_key DESC LIMIT ? OFFSET ?', [req.userId, pageSize, offset]);

    if (result.length === 0) {
      return res.json({ ok: true, data: [] });
    }

    const data = result[0].values.map(([dateKey, tree, topicCount, totalTurns, updatedAt]) => ({
      date_key: dateKey,
      tree: tree ? JSON.parse(tree) : null,
      topic_count: topicCount,
      total_turns: totalTurns,
      updated_at: updatedAt
    }));

    res.json({ ok: true, data });
  } catch (err) {
    console.error('get list error:', err);
    res.json({ ok: false, error: '获取列表失败' });
  }
});

// 获取日报
app.get('/api/report/:date', authMiddleware, async (req, res) => {
  try {
    await ensureDB();
    const { date } = req.params;
    const db = getDB();

    const result = db.exec('SELECT date_key, tree, topic_count, total_turns, share_token, updated_at FROM daily_summaries WHERE user_id = ? AND date_key = ?', [req.userId, date]);

    if (result.length === 0 || result[0].values.length === 0) {
      return res.json({ ok: false, error: '没有找到笔记' });
    }

    const [dateKey, tree, topicCount, totalTurns, shareToken, updatedAt] = result[0].values[0];

    res.json({
      ok: true,
      data: { date_key: dateKey, tree: tree ? JSON.parse(tree) : null, topic_count: topicCount, total_turns: totalTurns, share_token: shareToken, updated_at: updatedAt }
    });
  } catch (err) {
    console.error('get report error:', err);
    res.json({ ok: false, error: '获取日报失败' });
  }
});

// 生成分享链接
app.post('/api/report/share', authMiddleware, async (req, res) => {
  try {
    await ensureDB();
    const { date_key } = req.body;
    const crypto = require('crypto');

    if (!date_key) {
      return res.json({ ok: false, error: '日期不能为空' });
    }

    const db = getDB();
    const existing = db.exec('SELECT share_token, expires_at FROM share_links WHERE user_id = ? AND date_key = ? ORDER BY created_at DESC LIMIT 1', [req.userId, date_key]);

    if (existing.length > 0 && existing[0].values.length > 0) {
      const [token, expiresAt] = existing[0].values[0];
      if (new Date(expiresAt) > new Date()) {
        return res.json({ ok: true, share_token: token });
      }
    }

    const shareToken = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    db.run('INSERT INTO share_links (share_token, date_key, user_id, expires_at) VALUES (?, ?, ?, ?)', [shareToken, date_key, req.userId, expiresAt]);
    db.run('UPDATE daily_summaries SET share_token = ? WHERE user_id = ? AND date_key = ?', [shareToken, req.userId, date_key]);
    saveDB();

    res.json({ ok: true, share_token: shareToken });
  } catch (err) {
    console.error('share error:', err);
    res.json({ ok: false, error: '生成分享链接失败' });
  }
});

// 查看分享
app.get('/api/report/shared/:token', async (req, res) => {
  try {
    await ensureDB();
    const { token } = req.params;
    const db = getDB();

    const linkResult = db.exec('SELECT date_key, expires_at FROM share_links WHERE share_token = ?', [token]);

    if (linkResult.length === 0 || linkResult[0].values.length === 0) {
      return res.json({ ok: false, error: '分享链接无效' });
    }

    const [dateKey, expiresAt] = linkResult[0].values[0];

    if (new Date(expiresAt) < new Date()) {
      return res.json({ ok: false, error: '分享链接已过期' });
    }

    db.run('UPDATE share_links SET view_count = view_count + 1 WHERE share_token = ?', [token]);

    const summaryResult = db.exec('SELECT tree, topic_count, total_turns FROM daily_summaries WHERE share_token = ?', [token]);

    if (summaryResult.length === 0 || summaryResult[0].values.length === 0) {
      return res.json({ ok: false, error: '笔记不存在' });
    }

    const [tree, topicCount, totalTurns] = summaryResult[0].values[0];
    saveDB();

    res.json({
      ok: true,
      data: { date_key: dateKey, tree: tree ? JSON.parse(tree) : null, topic_count: topicCount, total_turns: totalTurns }
    });
  } catch (err) {
    console.error('get shared error:', err);
    res.json({ ok: false, error: '查看分享失败' });
  }
});

// 导入对话
app.post('/api/import', authMiddleware, async (req, res) => {
  try {
    await ensureDB();
    const { conversations } = req.body;

    if (!Array.isArray(conversations) || conversations.length === 0) {
      return res.json({ ok: false, error: '对话记录不能为空' });
    }

    const db = getDB();
    let imported = 0;

    for (const conv of conversations) {
      const { role, content, date_key, timestamp } = conv;
      if (!role || !content) continue;

      const dateKey = date_key || new Date().toISOString().slice(0, 10);
      const createdAt = timestamp || new Date().toISOString();

      db.run("INSERT INTO conversations (user_id, role, content, date_key, source, created_at) VALUES (?, ?, ?, ?, 'batch_import', ?)", [req.userId, role, content, dateKey, createdAt]);
      imported++;
    }

    saveDB();
    res.json({ ok: true, imported });
  } catch (err) {
    console.error('import error:', err);
    res.json({ ok: false, error: '导入失败' });
  }
});

// 获取用户信息
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    await ensureDB();
    const db = getDB();
    const result = db.exec('SELECT id, username, nickname FROM users WHERE id = ?', [req.userId]);

    if (result.length === 0 || result[0].values.length === 0) {
      return res.json({ ok: false, error: '用户不存在' });
    }

    const [id, username, nickname] = result[0].values[0];
    res.json({ ok: true, user: { id, username, nickname } });
  } catch (err) {
    console.error('get user error:', err);
    res.json({ ok: false, error: '获取用户信息失败' });
  }
});

// 独立运行模式（用于 Koyeb 等平台）
if (require.main === module) {
  const PORT = process.env.PORT || 3003;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
