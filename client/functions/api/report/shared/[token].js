// 查看分享笔记 API
import { initDB } from '../../_utils.js';

export async function onRequestGet(context) {
  const { request, env, params } = context;

  try {
    const { token } = params;

    const db = env.DB;
    await initDB(db);

    // 查找分享链接
    const linkResult = await db.prepare(
      'SELECT date_key, expires_at FROM share_links WHERE share_token = ?'
    ).bind(token).first();

    if (!linkResult) {
      return Response.json({ ok: false, error: '分享链接无效' });
    }

    if (new Date(linkResult.expires_at) < new Date()) {
      return Response.json({ ok: false, error: '分享链接已过期' });
    }

    // 更新查看次数
    await db.prepare(
      'UPDATE share_links SET view_count = view_count + 1 WHERE share_token = ?'
    ).bind(token).run();

    // 获取笔记
    const summaryResult = await db.prepare(
      'SELECT tree, topic_count, total_turns FROM daily_summaries WHERE share_token = ?'
    ).bind(token).first();

    if (!summaryResult) {
      return Response.json({ ok: false, error: '笔记不存在' });
    }

    return Response.json({
      ok: true,
      data: {
        date_key: linkResult.date_key,
        tree: summaryResult.tree ? JSON.parse(summaryResult.tree) : null,
        topic_count: summaryResult.topic_count,
        total_turns: summaryResult.total_turns
      }
    });
  } catch (err) {
    console.error('get shared error:', err);
    return Response.json({ ok: false, error: '查看分享失败' });
  }
}
