// 发送消息 API
import { requireAuth, initDB } from '../_utils.js';

const CATEGORIES = ['财经', '历史', '政治', '艺术', '科技', '自然'];

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

    // 异步更新学习分数（不阻塞响应）
    context.waitUntil(updateLearningScore(db, userId, message, reply, env.MIMO_API_KEY));

    return Response.json({ ok: true, reply, msgId });
  } catch (err) {
    console.error('send message error:', err);
    return Response.json({ ok: false, error: '发送消息失败: ' + err.message });
  }
}

// 异步更新学习分数
async function updateLearningScore(db, userId, userMessage, aiReply, mimoApiKey) {
  try {
    const dateKey = new Date().toISOString().slice(0, 10);

    // 使用 AI 判断对话属于哪个学习领域，并评分深度
    const classifyPrompt = `分析以下对话，返回JSON格式结果：
1. category: 问题所属领域（财经/历史/政治/艺术/科技/自然）
2. depth: 难度评分（1-10分，10分为最高难度）

对话内容：
用户：${userMessage}
AI：${aiReply}

请只返回JSON，不要其他内容：
{"category": "领域", "depth": 分数}`;

    const classifyResponse = await fetch('https://token-plan-cn.xiaomimimo.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + mimoApiKey
      },
      body: JSON.stringify({
        model: 'mimo-v2.5',
        max_tokens: 50,
        temperature: 0.1,
        messages: [
          { role: 'user', content: classifyPrompt }
        ]
      })
    });

    const classifyData = await classifyResponse.json();
    let category = '';
    let depth = 5;

    if (classifyData.choices && classifyData.choices[0]) {
      const content = classifyData.choices[0].message.content.trim();
      try {
        const result = JSON.parse(content);
        category = result.category;
        depth = result.depth || 5;
      } catch (e) {
        // 尝试从文本中提取
        const categoryMatch = content.match(/category['":\s]+(财经|历史|政治|艺术|科技|自然)/);
        const depthMatch = content.match(/depth['":\s]+(\d+)/);
        if (categoryMatch) category = categoryMatch[1];
        if (depthMatch) depth = parseInt(depthMatch[1]);
      }
    }

    // 验证分类结果
    if (!CATEGORIES.includes(category)) {
      console.log('Invalid category:', category);
      return;
    }

    // 验证深度分数范围
    depth = Math.max(1, Math.min(10, depth));

    // 检查每日同领域上限（每天同一领域最多计5题）
    const dailyCount = await db.prepare(
      'SELECT count FROM daily_category_count WHERE user_id = ? AND category = ? AND date_key = ?'
    ).bind(userId, category, dateKey).first();

    if (dailyCount && dailyCount.count >= 5) {
      console.log('Daily limit reached for category:', category);
      return;
    }

    // 更新每日计数
    if (dailyCount) {
      await db.prepare(
        'UPDATE daily_category_count SET count = count + 1 WHERE user_id = ? AND category = ? AND date_key = ?'
      ).bind(userId, category, dateKey).run();
    } else {
      await db.prepare(
        'INSERT INTO daily_category_count (user_id, category, date_key, count) VALUES (?, ?, ?, 1)'
      ).bind(userId, category, dateKey).run();
    }

    // 获取或创建用户分数记录
    let scoreRecord = await db.prepare(
      'SELECT * FROM user_scores WHERE user_id = ? AND category = ?'
    ).bind(userId, category).first();

    if (!scoreRecord) {
      // 创建新记录
      await db.prepare(
        'INSERT INTO user_scores (user_id, category, score, question_count, recent_depths, streak_days, last_study_date, weekly_active_days) VALUES (?, ?, 0, 0, \'[]\', 0, null, \'[]\')'
      ).bind(userId, category).run();

      scoreRecord = await db.prepare(
        'SELECT * FROM user_scores WHERE user_id = ? AND category = ?'
      ).bind(userId, category).first();
    }

    // 解析现有数据
    let recentDepths = [];
    try {
      recentDepths = JSON.parse(scoreRecord.recent_depths || '[]');
    } catch (e) {
      recentDepths = [];
    }

    let weeklyActiveDays = [];
    try {
      weeklyActiveDays = JSON.parse(scoreRecord.weekly_active_days || '[]');
    } catch (e) {
      weeklyActiveDays = [];
    }

    // 更新最近深度记录（保留最近10个）
    recentDepths.push(depth);
    if (recentDepths.length > 10) {
      recentDepths = recentDepths.slice(-10);
    }

    // 更新连续学习天数
    const today = dateKey;
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    let streakDays = scoreRecord.streak_days || 0;

    if (scoreRecord.last_study_date === yesterday) {
      // 连续学习
      streakDays += 1;
    } else if (scoreRecord.last_study_date !== today) {
      // 断了，重新开始
      streakDays = 1;
    }
    // 如果 last_study_date === today，streakDays 不变

    // 更新本周活跃天数
    const dayOfWeek = new Date().getDay();
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const todayName = dayNames[dayOfWeek];

    if (!weeklyActiveDays.includes(todayName)) {
      weeklyActiveDays.push(todayName);
    }

    // 检查是否需要重置本周活跃天数（如果上周的数据）
    const lastStudyDate = scoreRecord.last_study_date;
    if (lastStudyDate) {
      const lastDate = new Date(lastStudyDate);
      const currentDate = new Date();
      const daysDiff = Math.floor((currentDate - lastDate) / 86400000);
      if (daysDiff > 7) {
        weeklyActiveDays = [todayName];
      }
    }

    // 计算新分数
    const questionCount = (scoreRecord.question_count || 0) + 1;
    const newScore = calculateScore({
      question_count: questionCount,
      recent_depths: recentDepths,
      streak_days: streakDays,
      weekly_active_days: weeklyActiveDays
    });

    // 更新数据库
    await db.prepare(
      `UPDATE user_scores SET
        score = ?,
        question_count = ?,
        recent_depths = ?,
        streak_days = ?,
        last_study_date = ?,
        weekly_active_days = ?,
        updated_at = datetime('now')
      WHERE user_id = ? AND category = ?`
    ).bind(
      newScore,
      questionCount,
      JSON.stringify(recentDepths),
      streakDays,
      today,
      JSON.stringify(weeklyActiveDays),
      userId,
      category
    ).run();

    console.log('Updated score for category:', category, 'new score:', newScore);
  } catch (err) {
    console.error('updateLearningScore error:', err);
  }
}

// 计算分数算法
function calculateScore(record) {
  const { question_count, recent_depths, streak_days, weekly_active_days } = record;

  // 1. 数量分 (25%) - min(问题数 ×1.5, 100)
  const countScore = Math.min(question_count * 1.5, 100);

  // 2. 深度分 (30%) - 最近10题平均深度 ×10
  const avgDepth = recent_depths.length > 0
    ? recent_depths.reduce((a, b) => a + b, 0) / recent_depths.length
    : 0;
  const depthScore = avgDepth * 10;

  // 3. 体系分 (25%) - 连续同领域题数 ×8 + 知识链长度 ×10
  const streakScore = Math.min(streak_days * 8, 100);
  const chainScore = calculateChainScore(recent_depths);
  const systemScore = streakScore * 0.6 + chainScore * 0.4;

  // 4. 持续分 (20%) - 连续学习天数 ×8 + 本周活跃天数 ×5
  const continuousScore = streak_days * 8;
  const weeklyScore = (weekly_active_days || []).length * 5;
  const persistenceScore = Math.min(continuousScore + weeklyScore, 100);

  // 综合计算
  const total = countScore * 0.25 + depthScore * 0.30 + systemScore * 0.25 + persistenceScore * 0.20;

  return Math.round(Math.min(total, 100));
}

// 计算知识链分数
function calculateChainScore(depths) {
  if (depths.length < 2) return 0;

  let chainLength = 1;
  let maxChain = 1;

  for (let i = 1; i < depths.length; i++) {
    // 如果连续问题的深度差异不超过3分，认为是连续的知识链
    if (Math.abs(depths[i] - depths[i - 1]) <= 3) {
      chainLength++;
      maxChain = Math.max(maxChain, chainLength);
    } else {
      chainLength = 1;
    }
  }

  return Math.min(maxChain * 10, 100);
}
