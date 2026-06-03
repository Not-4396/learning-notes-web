// 获取用户学习分数 API
import { requireAuth, initDB } from '../_utils.js';

const CATEGORIES = ['财经', '历史', '政治', '艺术', '科技', '自然'];

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    const auth = requireAuth(request, env);
    if (auth.error) {
      return Response.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const db = env.DB;
    await initDB(db);
    const userId = auth.user.userId;

    // 查询用户所有领域的分数
    const result = await db.prepare(
      'SELECT category, score, question_count FROM user_scores WHERE user_id = ?'
    ).bind(userId).all();

    // 构建分数对象，默认所有领域为0
    const scores = {};
    CATEGORIES.forEach(cat => {
      scores[cat] = 0;
    });

    // 填充实际分数
    if (result.results) {
      result.results.forEach(row => {
        if (CATEGORIES.includes(row.category)) {
          scores[row.category] = row.score || 0;
        }
      });
    }

    return Response.json({
      ok: true,
      scores,
      total_questions: result.results ? result.results.reduce((sum, r) => sum + (r.question_count || 0), 0) : 0
    });
  } catch (err) {
    console.error('getUserScores error:', err);
    return Response.json({ ok: false, error: '获取分数失败' });
  }
}
