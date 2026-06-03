// 获取日报 API
import { requireAuth, initDB } from '../_utils.js';

export async function onRequestGet(context) {
  const { request, env, params } = context;

  try {
    const auth = requireAuth(request, env);
    if (auth.error) {
      return Response.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const { date } = params;
    const userId = auth.user.userId;

    const db = env.DB;
    await initDB(db);

    const result = await db.prepare(
      'SELECT date_key, tree, topic_count, total_turns, share_token, updated_at FROM daily_summaries WHERE user_id = ? AND date_key = ?'
    ).bind(userId, date).first();

    if (!result) {
      return Response.json({ ok: false, error: '没有找到笔记' });
    }

    return Response.json({
      ok: true,
      data: {
        date_key: result.date_key,
        tree: result.tree ? JSON.parse(result.tree) : null,
        topic_count: result.topic_count,
        total_turns: result.total_turns,
        share_token: result.share_token,
        updated_at: result.updated_at
      }
    });
  } catch (err) {
    console.error('get report error:', err);
    return Response.json({ ok: false, error: '获取日报失败' });
  }
}
