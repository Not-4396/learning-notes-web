// 导入对话 API
import { requireAuth, initDB } from './_utils.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const auth = requireAuth(request, env);
    if (auth.error) {
      return Response.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const { conversations } = await request.json();
    if (!Array.isArray(conversations) || conversations.length === 0) {
      return Response.json({ ok: false, error: '对话记录不能为空' });
    }

    const db = env.DB;
    await initDB(db);
    const userId = auth.user.userId;
    let imported = 0;

    for (const conv of conversations) {
      const { role, content, date_key, timestamp } = conv;
      if (!role || !content) continue;

      const dateKey = date_key || new Date().toISOString().slice(0, 10);
      const createdAt = timestamp || new Date().toISOString();

      await db.prepare(
        "INSERT INTO conversations (user_id, role, content, date_key, source, created_at) VALUES (?, ?, ?, ?, 'batch_import', ?)"
      ).bind(userId, role, content, dateKey, createdAt).run();

      imported++;
    }

    return Response.json({ ok: true, imported });
  } catch (err) {
    console.error('import error:', err);
    return Response.json({ ok: false, error: '导入失败: ' + err.message });
  }
}
