// 查询生成任务状态 API
import { requireAuth, initDB } from '../../_utils.js';

export async function onRequestGet(context) {
  const { request, env, params } = context;

  try {
    const auth = requireAuth(request, env);
    if (auth.error) {
      return Response.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const { taskId } = params;
    const userId = auth.user.userId;

    const db = env.DB;
    await initDB(db);

    const result = await db.prepare(
      'SELECT status, result FROM generate_tasks WHERE id = ? AND user_id = ?'
    ).bind(taskId, userId).first();

    if (!result) {
      return Response.json({ ok: false, error: '任务不存在' });
    }

    const resultData = result.result ? JSON.parse(result.result) : null;

    return Response.json({ ok: true, status: result.status, result: resultData });
  } catch (err) {
    console.error('poll error:', err);
    return Response.json({ ok: false, error: '查询状态失败' });
  }
}
