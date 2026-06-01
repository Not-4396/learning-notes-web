const express = require('express');
const { getDB, saveDB } = require('../services/db');
const { callMimo } = require('../services/mimo');

const router = express.Router();

// 获取历史对话
router.get('/history', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const db = getDB();

    const result = db.exec(`
      SELECT id, role, content, reply, created_at
      FROM conversations
      WHERE user_id = ? AND source = 'chat' AND replied = 1
      ORDER BY created_at DESC
      LIMIT ?
    `, [req.userId, limit]);

    if (result.length === 0) {
      return res.json({ ok: true, messages: [] });
    }

    // 组装对话对
    const messages = [];
    const rows = result[0].values.reverse();

    for (const [id, role, content, reply, createdAt] of rows) {
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

// 发送消息（普通响应）
router.post('/send', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.json({ ok: false, error: '消息不能为空' });
    }

    const db = getDB();
    const dateKey = new Date().toISOString().slice(0, 10);

    // 保存用户消息
    db.run(`
      INSERT INTO conversations (user_id, role, content, date_key, source)
      VALUES (?, 'user', ?, ?, 'chat')
    `, [req.userId, message.trim(), dateKey]);
    saveDB();

    // 获取消息 ID
    const result = db.exec('SELECT last_insert_rowid() as id');
    const msgId = result[0].values[0][0];

    // 获取最近的历史对话作为上下文
    const historyResult = db.exec(`
      SELECT role, content, reply FROM conversations
      WHERE user_id = ? AND source = 'chat'
      ORDER BY created_at DESC
      LIMIT 4
    `, [req.userId]);

    const history = [];
    if (historyResult.length > 0) {
      for (const [role, content, reply] of historyResult[0].values.reverse()) {
        if (role === 'user') {
          history.push({ role: 'user', content });
          if (reply) {
            history.push({ role: 'assistant', content: reply });
          }
        }
      }
    }

    // 构建消息列表
    const messages = [
      { role: 'system', content: '你是AI学习助手，用简洁中文回答，控制在300字内。支持Markdown格式。' },
      ...history,
      { role: 'user', content: message.trim() }
    ];

    // 调用 MIMO API
    const reply = await callMimo(messages, { maxTokens: 800, temperature: 0.7 });

    // 保存 AI 回复
    db.run(`
      UPDATE conversations SET reply = ?, replied = 1 WHERE id = ?
    `, [reply, msgId]);

    // 保存 AI 回复记录
    db.run(`
      INSERT INTO conversations (user_id, role, content, date_key, source, replied)
      VALUES (?, 'assistant', ?, ?, 'chat', 1)
    `, [req.userId, reply, dateKey]);
    saveDB();

    // 返回回复
    res.json({ ok: true, reply, msgId });
  } catch (err) {
    console.error('send message error:', err);
    res.json({ ok: false, error: '发送消息失败: ' + err.message });
  }
});

module.exports = router;
