// 更新用户学习分数 API
import { requireAuth, initDB } from '../_utils.js';

const CATEGORIES = ['财经', '历史', '政治', '艺术', '科技', '自然'];

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const auth = requireAuth(request, env);
    if (auth.error) {
      return Response.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const { category, score = 5 } = await request.json();

    if (!category || !CATEGORIES.includes(category)) {
      return Response.json({ ok: false, error: '无效的学习领域' });
    }

    const db = env.DB;
    await initDB(db);
    const userId = auth.user.userId;

    // 更新或插入分数
    const existing = await db.prepare(
      'SELECT id, score, question_count FROM user_scores WHERE user_id = ? AND category = ?'
    ).bind(userId, category).first();

    if (existing) {
      // 更新现有记录
      await db.prepare(
        'UPDATE user_scores SET score = score + ?, question_count = question_count + 1, updated_at = datetime(\'now\') WHERE id = ?'
      ).bind(score, existing.id).run();
    } else {
      // 插入新记录
      await db.prepare(
        'INSERT INTO user_scores (user_id, category, score, question_count) VALUES (?, ?, ?, 1)'
      ).bind(userId, category, score).run();
    }

    return Response.json({ ok: true, category, score });
  } catch (err) {
    console.error('updateScore error:', err);
    return Response.json({ ok: false, error: '更新分数失败' });
  }
}
