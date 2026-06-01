const express = require('express');
const bcrypt = require('bcryptjs');
const { getDB, saveDB } = require('../services/db');
const { generateToken } = require('../middleware/auth');

const router = express.Router();

// 注册
router.post('/register', async (req, res) => {
  try {
    const { username, password, nickname } = req.body;

    if (!username || !password) {
      return res.json({ ok: false, error: '用户名和密码不能为空' });
    }

    if (username.length < 3 || username.length > 20) {
      return res.json({ ok: false, error: '用户名长度 3-20 个字符' });
    }

    if (password.length < 6) {
      return res.json({ ok: false, error: '密码至少 6 个字符' });
    }

    const db = getDB();

    // 检查用户名是否已存在
    const existing = db.exec('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length > 0 && existing[0].values.length > 0) {
      return res.json({ ok: false, error: '用户名已存在' });
    }

    // 加密密码
    const passwordHash = bcrypt.hashSync(password, 10);

    // 创建用户
    db.run(
      'INSERT INTO users (username, password_hash, nickname) VALUES (?, ?, ?)',
      [username, passwordHash, nickname || username]
    );
    saveDB();

    // 获取新创建的用户
    const result = db.exec('SELECT last_insert_rowid() as id');
    const userId = result[0].values[0][0];

    // 生成 token
    const token = generateToken(userId, username);

    res.json({
      ok: true,
      token,
      user: { id: userId, username, nickname: nickname || username }
    });
  } catch (err) {
    console.error('register error:', err);
    res.json({ ok: false, error: '注册失败' });
  }
});

// 登录
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.json({ ok: false, error: '用户名和密码不能为空' });
    }

    const db = getDB();

    // 查询用户
    const result = db.exec(
      'SELECT id, username, password_hash, nickname, avatar_url FROM users WHERE username = ?',
      [username]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return res.json({ ok: false, error: '用户名或密码错误' });
    }

    const [id, usernameDb, passwordHash, nickname, avatarUrl] = result[0].values[0];

    // 验证密码
    if (!bcrypt.compareSync(password, passwordHash)) {
      return res.json({ ok: false, error: '用户名或密码错误' });
    }

    // 更新最后登录时间
    db.run('UPDATE users SET last_login = datetime("now") WHERE id = ?', [id]);
    saveDB();

    // 生成 token
    const token = generateToken(id, usernameDb);

    res.json({
      ok: true,
      token,
      user: { id, username: usernameDb, nickname, avatarUrl }
    });
  } catch (err) {
    console.error('login error:', err);
    res.json({ ok: false, error: '登录失败' });
  }
});

// 获取当前用户信息
router.get('/me', (req, res) => {
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
    res.json({
      ok: true,
      user: { id, username, nickname, avatarUrl }
    });
  } catch (err) {
    console.error('get user error:', err);
    res.json({ ok: false, error: '获取用户信息失败' });
  }
});

module.exports = router;
