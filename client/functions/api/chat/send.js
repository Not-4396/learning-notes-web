// 发送消息 API
import { requireAuth, initDB } from '../_utils.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const auth = requireAuth(request, env);
    if (auth.error) {
      return Response.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const { message } = await request.json();
    if (!message || !message.trim()) {
      return Response.json({ ok: false, error: '消息不能为空' });
    }

    const db = env.DB;
    await initDB(db);

    const dateKey = new Date().toISOString().slice(0, 10);
    const userId = auth.user.userId;

    // 插入用户消息
    const result = await db.prepare(
      "INSERT INTO conversations (user_id, role, content, date_key, source) VALUES (?, 'user', ?, ?, 'chat')"
    ).bind(userId, message.trim(), dateKey).run();

    const msgId = result.meta.last_row_id;

    // 获取历史对话
    const historyResult = await db.prepare(
      "SELECT role, content, reply FROM conversations WHERE user_id = ? AND source = 'chat' ORDER BY created_at DESC LIMIT 4"
    ).bind(userId).all();

    const history = [];
    if (historyResult.results) {
      for (const row of historyResult.results.reverse()) {
        if (row.role === 'user') {
          history.push({ role: 'user', content: row.content });
          if (row.reply) history.push({ role: 'assistant', content: row.reply });
        }
      }
    }

    const messages = [
      { role: 'system', content: '你是AI学习助手，用简洁中文回答，控制在300字内。支持Markdown格式。' },
      ...history,
      { role: 'user', content: message.trim() }
    ];

    // 调用 MIMO API
    const MIMO_API_KEY = env.MIMO_API_KEY;
    const MIMO_API_URL = 'https://token-plan-cn.xiaomimimo.com/v1/chat/completions';

    console.log('Calling MIMO API with key:', MIMO_API_KEY ? 'exists' : 'missing');

    const apiResponse = await fetch(MIMO_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + MIMO_API_KEY
      },
      body: JSON.stringify({
        model: 'mimo-v2.5',
        max_tokens: 800,
        temperature: 0.7,
        messages
      })
    });

    console.log('MIMO API response status:', apiResponse.status);
    const responseText = await apiResponse.text();
    console.log('MIMO API response text:', responseText.substring(0, 500));

    let apiData;
    try {
      apiData = JSON.parse(responseText);
    } catch (e) {
      throw new Error('Invalid JSON response: ' + responseText.substring(0, 200));
    }

    let reply = '';

    if (apiData.choices && apiData.choices[0]) {
      const msg = apiData.choices[0].message;
      reply = msg.content || msg.reasoning_content || '';
    } else {
      console.error('Unexpected API response structure:', JSON.stringify(apiData).substring(0, 500));
      throw new Error('Invalid API response: ' + (apiData.error?.message || JSON.stringify(apiData).substring(0, 200)));
    }

    // 更新数据库
    await db.prepare('UPDATE conversations SET reply = ?, replied = 1 WHERE id = ?').bind(reply, msgId).run();
    await db.prepare(
      "INSERT INTO conversations (user_id, role, content, date_key, source, replied) VALUES (?, 'assistant', ?, ?, 'chat', 1)"
    ).bind(userId, reply, dateKey).run();

    return Response.json({ ok: true, reply, msgId });
  } catch (err) {
    console.error('send message error:', err);
    return Response.json({ ok: false, error: '发送消息失败: ' + err.message });
  }
}
