// 获取用户信息 API
import { requireAuth, initDB } from '../_utils.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    const auth = requireAuth(request, env);
    if (auth.error) {
      return Response.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const db = env.DB;
    await initDB(db);

    const user = await db.prepare('SELECT id, username, nickname FROM users WHERE id = ?').bind(auth.user.userId).first();

    if (!user) {
      return Response.json({ ok: false, error: '用户不存在' });
    }

    return Response.json({ ok: true, user });
  } catch (err) {
    console.error('get user error:', err);
    return Response.json({ ok: false, error: '获取用户信息失败' });
  }
}
