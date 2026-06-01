const express = require('express');
const { getDB, saveDB } = require('../services/db');
const { callMimo } = require('../services/mimo');

const router = express.Router();

// 生成笔记
router.post('/generate', async (req, res) => {
  try {
    const { date_key } = req.body;

    if (!date_key) {
      return res.json({ ok: false, error: '日期不能为空' });
    }

    const db = getDB();

    // 获取当前最大 ID
    const maxIdResult = db.exec('SELECT MAX(id) as max_id FROM generate_tasks');
    const nextId = (maxIdResult[0]?.values[0][0] || 0) + 1;

    // 创建生成任务
    db.run(`
      INSERT INTO generate_tasks (id, user_id, date_key, status)
      VALUES (?, ?, ?, 'processing')
    `, [nextId, req.userId, date_key]);
    saveDB();

    console.log(`[Generate] Created task ${nextId} for user ${req.userId}, date ${date_key}`);

    // 异步处理生成
    processGenerate(nextId, req.userId, date_key).catch(err => {
      console.error('generate error:', err);
    });

    res.json({ ok: true, task_id: nextId });
  } catch (err) {
    console.error('generate summary error:', err);
    res.json({ ok: false, error: '启动生成失败' });
  }
});

// 查询生成状态
router.get('/poll/:taskId', (req, res) => {
  try {
    const { taskId } = req.params;
    const db = getDB();

    const result = db.exec(`
      SELECT status, result FROM generate_tasks
      WHERE id = ? AND user_id = ?
    `, [taskId, req.userId]);

    if (result.length === 0 || result[0].values.length === 0) {
      return res.json({ ok: false, error: '任务不存在' });
    }

    const [status, resultStr] = result[0].values[0];
    const resultData = resultStr ? JSON.parse(resultStr) : null;

    res.json({
      ok: true,
      status,
      result: resultData
    });
  } catch (err) {
    console.error('poll task error:', err);
    res.json({ ok: false, error: '查询状态失败' });
  }
});

// 异步处理生成
async function processGenerate(taskId, userId, dateKey) {
  const db = getDB();

  try {
    console.log(`[Generate] Starting task ${taskId} for user ${userId}, date ${dateKey}`);

    // 获取用户的对话
    const convResult = db.exec(`
      SELECT id, role, content FROM conversations
      WHERE user_id = ? AND date_key = ?
      ORDER BY created_at ASC
      LIMIT 50
    `, [userId, dateKey]);

    console.log(`[Generate] Found ${convResult.length > 0 ? convResult[0].values.length : 0} conversations`);

    if (convResult.length === 0 || convResult[0].values.length === 0) {
      console.log(`[Generate] No conversations found, updating task to error`);
      db.run(`
        UPDATE generate_tasks SET status = 'error', result = ? WHERE id = ?
      `, [JSON.stringify({ error: '没有对话记录' }), taskId]);
      saveDB();
      return;
    }

    // 构建对话文本
    let text = '';
    for (const [id, role, content] of convResult[0].values) {
      const prefix = role === 'user' ? '用户' : 'AI';
      const truncated = content.length > 1500 ? content.slice(0, 1500) + '...' : content;
      text += `[${prefix}]: ${truncated}\n\n`;
    }

    if (text.length > 15000) text = text.slice(0, 15000) + '\n...[已截断]';

    const prompt = `将以下对话整理成知识树JSON：
{
  "id": "root",
  "label": "${dateKey} 学习笔记",
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

    console.log(`[Generate] Calling MIMO API...`);
    const reply = await callMimo([
      { role: 'system', content: prompt },
      { role: 'user', content: text }
    ], { maxTokens: 4096 });

    console.log(`[Generate] MIMO reply length: ${reply.length}`);
    console.log(`[Generate] MIMO reply preview: ${reply.slice(0, 300)}`);

    // 解析 JSON
    let tree;
    try {
      tree = JSON.parse(reply);
      console.log(`[Generate] JSON parsed successfully`);
    } catch (e) {
      console.log(`[Generate] JSON parse failed: ${e.message}`);
      // 尝试修复不完整的 JSON
      try {
        // 尝试从 markdown 代码块中提取
        const match = reply.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (match) {
          tree = JSON.parse(match[1].trim());
          console.log(`[Generate] Extracted from markdown`);
        } else {
          // 尝试修复截断的 JSON
          let fixedReply = reply;
          // 移除末尾的不完整内容
          const lastComplete = fixedReply.lastIndexOf('}');
          if (lastComplete > 0) {
            fixedReply = fixedReply.slice(0, lastComplete + 1);
            // 补全缺失的括号
            const openBraces = (fixedReply.match(/{/g) || []).length;
            const closeBraces = (fixedReply.match(/}/g) || []).length;
            const openBrackets = (fixedReply.match(/\[/g) || []).length;
            const closeBrackets = (fixedReply.match(/]/g) || []).length;
            for (let i = 0; i < openBrackets - closeBrackets; i++) fixedReply += ']';
            for (let i = 0; i < openBraces - closeBraces; i++) fixedReply += '}';
            tree = JSON.parse(fixedReply);
            console.log(`[Generate] Fixed truncated JSON`);
          } else {
            tree = { id: 'root', label: dateKey, children: [] };
          }
        }
      } catch (e2) {
        console.log(`[Generate] All parse attempts failed`);
        tree = { id: 'root', label: dateKey, children: [] };
      }
    }

    // 保存或更新摘要
    const existingResult = db.exec(`
      SELECT id FROM daily_summaries WHERE user_id = ? AND date_key = ?
    `, [userId, dateKey]);

    const topicCount = tree.children ? tree.children.length : 0;
    const convCount = convResult[0].values.length;

    if (existingResult.length > 0 && existingResult[0].values.length > 0) {
      const summaryId = existingResult[0].values[0][0];
      db.run(`
        UPDATE daily_summaries
        SET tree = ?, topic_count = ?, total_turns = ?, updated_at = datetime('now')
        WHERE id = ?
      `, [JSON.stringify(tree), topicCount, convCount, summaryId]);
    } else {
      db.run(`
        INSERT INTO daily_summaries (user_id, date_key, tree, topic_count, total_turns)
        VALUES (?, ?, ?, ?, ?)
      `, [userId, dateKey, JSON.stringify(tree), topicCount, convCount]);
    }

    // 更新任务状态
    db.run(`
      UPDATE generate_tasks SET status = 'done', result = ? WHERE id = ?
    `, [JSON.stringify({ topic_count: topicCount }), taskId]);
    saveDB();

  } catch (err) {
    console.error('processGenerate error:', err);
    db.run(`
      UPDATE generate_tasks SET status = 'error', result = ? WHERE id = ?
    `, [JSON.stringify({ error: err.message }), taskId]);
    saveDB();
  }
}

module.exports = router;
