const express = require('express');
const { getDB, saveDB } = require('../services/db');

const router = express.Router();

// 导入对话记录
router.post('/', (req, res) => {
  try {
    const { conversations } = req.body;

    if (!Array.isArray(conversations) || conversations.length === 0) {
      return res.json({ ok: false, error: '对话记录不能为空' });
    }

    const db = getDB();
    let imported = 0;

    // 批量插入
    for (const conv of conversations) {
      const { role, content, date_key, timestamp } = conv;

      if (!role || !content) continue;

      const dateKey = date_key || new Date().toISOString().slice(0, 10);
      const createdAt = timestamp || new Date().toISOString();

      db.run(`
        INSERT INTO conversations (user_id, role, content, date_key, source, created_at)
        VALUES (?, ?, ?, ?, 'batch_import', ?)
      `, [req.userId, role, content, dateKey, createdAt]);
      imported++;
    }

    saveDB();

    res.json({ ok: true, imported });
  } catch (err) {
    console.error('import conversations error:', err);
    res.json({ ok: false, error: '导入失败' });
  }
});

module.exports = router;
