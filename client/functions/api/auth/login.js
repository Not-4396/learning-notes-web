// 登录 API
import { generateToken, initDB } from '../_utils.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return Response.json({ ok: false, error: '用户名和密码不能为空' });
    }

    const db = env.DB;
    await initDB(db);

    // 查找用户
    const user = await db.prepare('SELECT id, username, password_hash, nickname FROM users WHERE username = ?').bind(username).first();

    if (!user) {
      return Response.json({ ok: false, error: '用户名或密码错误' });
    }

    // 验证密码
    const bcrypt = await import('bcryptjs');
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return Response.json({ ok: false, error: '用户名或密码错误' });
    }

    // 更新最后登录时间
    await db.prepare('UPDATE users SET last_login = datetime("now") WHERE id = ?').bind(user.id).run();

    const token = generateToken(user.id, user.username, env.JWT_SECRET);

    return Response.json({
      ok: true,
      token,
      user: { id: user.id, username: user.username, nickname: user.nickname }
    });
  } catch (err) {
    console.error('login error:', err);
    return Response.json({ ok: false, error: '登录失败: ' + err.message });
  }
}
