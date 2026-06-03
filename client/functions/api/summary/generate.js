// 生成笔记 API
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

    // 创建生成任务
    const maxIdResult = await db.prepare('SELECT MAX(id) as max_id FROM generate_tasks').first();
    const nextId = (maxIdResult?.max_id || 0) + 1;

    await db.prepare(
      "INSERT INTO generate_tasks (id, user_id, date_key, status) VALUES (?, ?, ?, 'processing')"
    ).bind(nextId, userId, date_key).run();

    // 获取对话记录
    const convResult = await db.prepare(
      'SELECT role, content FROM conversations WHERE user_id = ? AND date_key = ? ORDER BY created_at ASC LIMIT 50'
    ).bind(userId, date_key).all();

    if (!convResult.results || convResult.results.length === 0) {
      await db.prepare(
        'UPDATE generate_tasks SET status = \'error\', result = ? WHERE id = ?'
      ).bind(JSON.stringify({ error: '没有对话记录' }), nextId).run();

      return Response.json({ ok: true, task_id: nextId });
    }

    let text = '';
    for (const row of convResult.results) {
      const prefix = row.role === 'user' ? '用户' : 'AI';
      const truncated = row.content.length > 1500 ? row.content.slice(0, 1500) + '...' : row.content;
      text += `[${prefix}]: ${truncated}\n\n`;
    }

    if (text.length > 15000) text = text.slice(0, 15000) + '\n...[已截断]';

    const prompt = `将以下对话整理成知识树JSON：
{
  "id": "root",
  "label": "${date_key} 学习笔记",
  "children": [
    {
      "id": "t1",
      "label": "主题名",
      "summary": "一句话总结",
      "children": [
        {
          "id": "s1",
          "label": "核心概念",
          "summary": "概念说明",
          "children": [
            {"id": "d1", "label": "细节要点", "detail": "具体说明"}
          ]
        }
      ]
    }
  ]
}
规则：提取学习知识点，最多4层，中文标签，只输出JSON。`;

    // 调用 MIMO API
    const MIMO_API_KEY = env.MIMO_API_KEY;
    const MIMO_API_URL = 'https://token-plan-cn.xiaomimimo.com/v1/chat/completions';

    const apiResponse = await fetch(MIMO_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + MIMO_API_KEY
      },
      body: JSON.stringify({
        model: 'mimo-v2.5',
        max_tokens: 4096,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: text }
        ]
      })
    });

    const apiData = await apiResponse.json();
    let reply = '';

    if (apiData.choices && apiData.choices[0]) {
      const msg = apiData.choices[0].message;
      reply = msg.content || msg.reasoning_content || '';
    } else {
      throw new Error('Invalid API response');
    }

    // 解析 JSON
    let tree;
    try {
      tree = JSON.parse(reply);
    } catch (e) {
      try {
        const match = reply.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (match) {
          tree = JSON.parse(match[1].trim());
        } else {
          let fixedReply = reply;
          const lastComplete = fixedReply.lastIndexOf('}');
          if (lastComplete > 0) {
            fixedReply = fixedReply.slice(0, lastComplete + 1);
            const openBraces = (fixedReply.match(/{/g) || []).length;
            const closeBraces = (fixedReply.match(/}/g) || []).length;
            const openBrackets = (fixedReply.match(/\[/g) || []).length;
            const closeBrackets = (fixedReply.match(/]/g) || []).length;
            for (let i = 0; i < openBrackets - closeBrackets; i++) fixedReply += ']';
            for (let i = 0; i < openBraces - closeBraces; i++) fixedReply += '}';
            tree = JSON.parse(fixedReply);
          } else {
            tree = { id: 'root', label: date_key, children: [] };
          }
        }
      } catch (e2) {
        tree = { id: 'root', label: date_key, children: [] };
      }
    }

    const topicCount = tree.children ? tree.children.length : 0;
    const convCount = convResult.results.length;

    // 保存笔记
    const existingResult = await db.prepare(
      'SELECT id FROM daily_summaries WHERE user_id = ? AND date_key = ?'
    ).bind(userId, date_key).first();

    if (existingResult) {
      await db.prepare(
        'UPDATE daily_summaries SET tree = ?, topic_count = ?, total_turns = ?, updated_at = datetime(\'now\') WHERE id = ?'
      ).bind(JSON.stringify(tree), topicCount, convCount, existingResult.id).run();
    } else {
      await db.prepare(
        'INSERT INTO daily_summaries (user_id, date_key, tree, topic_count, total_turns) VALUES (?, ?, ?, ?, ?)'
      ).bind(userId, date_key, JSON.stringify(tree), topicCount, convCount).run();
    }

    // 更新任务状态
    await db.prepare(
      'UPDATE generate_tasks SET status = \'done\', result = ? WHERE id = ?'
    ).bind(JSON.stringify({ topic_count: topicCount }), nextId).run();

    return Response.json({ ok: true, task_id: nextId });
  } catch (err) {
    console.error('generate error:', err);
    return Response.json({ ok: false, error: '生成失败: ' + err.message });
  }
}
