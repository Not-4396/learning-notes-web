// 生成分享链接 API
import { requireAuth, initDB } from '../_utils.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const auth = requireAuth(request, env);
    if (auth.error) {
      return Response.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const { date_key } = await request.json();
    if (!date_key) {
      return Response.json({ ok: false, error: '日期不能为空' });
    }

    const db = env.DB;
    await initDB(db);
    const userId = auth.user.userId;

    // 检查是否已有分享链接
    const existing = await db.prepare(
      'SELECT share_token, expires_at FROM share_links WHERE user_id = ? AND date_key = ? ORDER BY created_at DESC LIMIT 1'
    ).bind(userId, date_key).first();

    if (existing && new Date(existing.expires_at) > new Date()) {
      return Response.json({ ok: true, share_token: existing.share_token });
    }

    // 生成新的分享链接
    const shareToken = crypto.randomUUID().replace(/-/g, '');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await db.prepare(
      'INSERT INTO share_links (share_token, date_key, user_id, expires_at) VALUES (?, ?, ?, ?)'
    ).bind(shareToken, date_key, userId, expiresAt).run();

    await db.prepare(
      'UPDATE daily_summaries SET share_token = ? WHERE user_id = ? AND date_key = ?'
    ).bind(shareToken, userId, date_key).run();

    return Response.json({ ok: true, share_token: shareToken });
  } catch (err) {
    console.error('share error:', err);
    return Response.json({ ok: false, error: '生成分享链接失败' });
  }
}
