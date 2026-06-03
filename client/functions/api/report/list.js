// 获取笔记列表 API
import { requireAuth, initDB } from '../_utils.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    const auth = requireAuth(request, env);
    if (auth.error) {
      return Response.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page')) || 1;
    const pageSize = parseInt(url.searchParams.get('pageSize')) || 20;
    const offset = (page - 1) * pageSize;
    const userId = auth.user.userId;

    const db = env.DB;
    await initDB(db);

    const result = await db.prepare(
      'SELECT date_key, tree, topic_count, total_turns, updated_at FROM daily_summaries WHERE user_id = ? ORDER BY date_key DESC LIMIT ? OFFSET ?'
    ).bind(userId, pageSize, offset).all();

    const data = [];
    if (result.results) {
      for (const row of result.results) {
        data.push({
          date_key: row.date_key,
          tree: row.tree ? JSON.parse(row.tree) : null,
          topic_count: row.topic_count,
          total_turns: row.total_turns,
          updated_at: row.updated_at
        });
      }
    }

    return Response.json({ ok: true, data });
  } catch (err) {
    console.error('get list error:', err);
    return Response.json({ ok: false, error: '获取列表失败' });
  }
}
