// 注册 API
import { generateToken, initDB } from '../_utils.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { username, password, nickname } = await request.json();

    if (!username || !password) {
      return Response.json({ ok: false, error: '用户名和密码不能为空' });
    }

    const db = env.DB;
    await initDB(db);

    // 检查用户名是否存在
    const existing = await db.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
    if (existing) {
      return Response.json({ ok: false, error: '用户名已存在' });
    }

    // 加密密码
    const passwordHash = await bcrypt.hash(password, 10);

    // 插入用户
    const result = await db.prepare('INSERT INTO users (username, password_hash, nickname) VALUES (?, ?, ?)').bind(username, passwordHash, nickname || username).run();

    const userId = result.meta.last_row_id;
    const token = generateToken(userId, username, env.JWT_SECRET);

    return Response.json({
      ok: true,
      token,
      user: { id: userId, username, nickname: nickname || username }
    });
  } catch (err) {
    console.error('register error:', err);
    return Response.json({ ok: false, error: '注册失败: ' + err.message });
  }
}
