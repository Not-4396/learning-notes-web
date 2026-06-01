const express = require('express');
const crypto = require('crypto');
const { getDB, saveDB } = require('../services/db');

const router = express.Router();

// 获取笔记列表
router.get('/list', (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    const offset = (page - 1) * pageSize;
    const db = getDB();

    const result = db.exec(`
      SELECT date_key, tree, topic_count, total_turns, updated_at
      FROM daily_summaries
      WHERE user_id = ?
      ORDER BY date_key DESC
      LIMIT ? OFFSET ?
    `, [req.userId, pageSize, offset]);

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
    console.error('get report list error:', err);
    res.json({ ok: false, error: '获取笔记列表失败' });
  }
});

// 获取指定日期的日报
router.get('/:date', (req, res) => {
  try {
    const { date } = req.params;
    const db = getDB();

    const result = db.exec(`
      SELECT id, date_key, tree, topic_count, total_turns, share_token, updated_at
      FROM daily_summaries
      WHERE user_id = ? AND date_key = ?
    `, [req.userId, date]);

    if (result.length === 0 || result[0].values.length === 0) {
      return res.json({ ok: false, error: '没有找到笔记' });
    }

    const [id, dateKey, tree, topicCount, totalTurns, shareToken, updatedAt] = result[0].values[0];

    res.json({
      ok: true,
      data: {
        id,
        date_key: dateKey,
        tree: tree ? JSON.parse(tree) : null,
        topic_count: topicCount,
        total_turns: totalTurns,
        share_token: shareToken,
        updated_at: updatedAt
      }
    });
  } catch (err) {
    console.error('get report error:', err);
    res.json({ ok: false, error: '获取日报失败' });
  }
});

// 生成分享链接
router.post('/share', (req, res) => {
  try {
    const { date_key } = req.body;

    if (!date_key) {
      return res.json({ ok: false, error: '日期不能为空' });
    }

    const db = getDB();

    // 检查是否已有分享链接
    const existing = db.exec(`
      SELECT share_token, expires_at FROM share_links
      WHERE user_id = ? AND date_key = ?
      ORDER BY created_at DESC LIMIT 1
    `, [req.userId, date_key]);

    if (existing.length > 0 && existing[0].values.length > 0) {
      const [token, expiresAt] = existing[0].values[0];
      if (new Date(expiresAt) > new Date()) {
        return res.json({ ok: true, share_token: token });
      }
    }

    // 生成新的分享 token
    const shareToken = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    db.run(`
      INSERT INTO share_links (share_token, date_key, user_id, expires_at)
      VALUES (?, ?, ?, ?)
    `, [shareToken, date_key, req.userId, expiresAt]);

    // 更新摘要的 share_token
    db.run(`
      UPDATE daily_summaries SET share_token = ? WHERE user_id = ? AND date_key = ?
    `, [shareToken, req.userId, date_key]);
    saveDB();

    res.json({ ok: true, share_token: shareToken });
  } catch (err) {
    console.error('share report error:', err);
    res.json({ ok: false, error: '生成分享链接失败' });
  }
});

// 查看分享的日报
router.get('/shared/:token', (req, res) => {
  try {
    const { token } = req.params;
    const db = getDB();

    // 查询分享链接
    const linkResult = db.exec(`
      SELECT date_key, expires_at, view_count FROM share_links
      WHERE share_token = ?
    `, [token]);

    if (linkResult.length === 0 || linkResult[0].values.length === 0) {
      return res.json({ ok: false, error: '分享链接无效' });
    }

    const [dateKey, expiresAt, viewCount] = linkResult[0].values[0];

    if (new Date(expiresAt) < new Date()) {
      return res.json({ ok: false, error: '分享链接已过期' });
    }

    // 增加浏览次数
    db.run(`
      UPDATE share_links SET view_count = view_count + 1 WHERE share_token = ?
    `, [token]);

    // 获取摘要
    const summaryResult = db.exec(`
      SELECT tree, topic_count, total_turns FROM daily_summaries
      WHERE share_token = ?
    `, [token]);

    if (summaryResult.length === 0 || summaryResult[0].values.length === 0) {
      return res.json({ ok: false, error: '笔记不存在' });
    }

    const [tree, topicCount, totalTurns] = summaryResult[0].values[0];
    saveDB();

    res.json({
      ok: true,
      data: {
        date_key: dateKey,
        tree: tree ? JSON.parse(tree) : null,
        topic_count: topicCount,
        total_turns: totalTurns
      }
    });
  } catch (err) {
    console.error('get shared report error:', err);
    res.json({ ok: false, error: '查看分享失败' });
  }
});

module.exports = router;
