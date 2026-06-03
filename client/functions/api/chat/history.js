// 获取聊天历史 API
import { requireAuth, initDB } from '../_utils.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    const auth = requireAuth(request, env);
    if (auth.error) {
      return Response.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit')) || 50;
    const userId = auth.user.userId;

    const db = env.DB;
    await initDB(db);

    const result = await db.prepare(
      "SELECT role, content, reply FROM conversations WHERE user_id = ? AND source = 'chat' AND replied = 1 ORDER BY created_at DESC LIMIT ?"
    ).bind(userId, limit).all();

    const messages = [];
    if (result.results) {
      for (const row of result.results.reverse()) {
        if (row.role === 'user' && row.reply) {
          messages.push({ role: 'user', content: row.content });
          messages.push({ role: 'assistant', content: row.reply });
        }
      }
    }

    return Response.json({ ok: true, messages });
  } catch (err) {
    console.error('get history error:', err);
    return Response.json({ ok: false, error: '获取历史对话失败' });
  }
}
