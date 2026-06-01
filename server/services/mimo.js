const https = require('https');

const MIMO_API_KEY = process.env.MIMO_API_KEY;
const MIMO_API_URL = process.env.MIMO_API_URL || 'https://token-plan-cn.xiaomimimo.com/v1/chat/completions';

// 普通调用（非流式）
async function callMimo(messages, options = {}) {
  const { maxTokens = 800, temperature = 0.7 } = options;

  const body = JSON.stringify({
    model: 'mimo-v2.5',
    max_tokens: maxTokens,
    temperature,
    messages
  });

  return new Promise((resolve, reject) => {
    const url = new URL(MIMO_API_URL);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      timeout: 50000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + MIMO_API_KEY
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.choices && json.choices[0]) {
            // MIMO API 可能把内容放在 reasoning_content 里
            const message = json.choices[0].message;
            const content = message.content || message.reasoning_content || '';
            resolve(content);
          } else {
            reject(new Error('Invalid API response: ' + data.slice(0, 200)));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('API timeout'));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// 流式调用（SSE）
function callMimoStream(messages, options = {}) {
  const { maxTokens = 800, temperature = 0.7 } = options;

  const body = JSON.stringify({
    model: 'mimo-v2.5',
    max_tokens: maxTokens,
    temperature,
    stream: true,
    messages
  });

  return new Promise((resolve, reject) => {
    const url = new URL(MIMO_API_URL);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      timeout: 50000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + MIMO_API_KEY
      }
    }, (res) => {
      let buffer = '';
      let fullContent = '';

      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              resolve(fullContent);
              return;
            }
            try {
              const json = JSON.parse(data);
              const content = json.choices?.[0]?.delta?.content || '';
              if (content) {
                fullContent += content;
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      });

      res.on('end', () => {
        resolve(fullContent);
      });

      res.on('error', reject);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('API timeout'));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// 创建可读流，用于 SSE 响应
function createMimoStream(messages, options = {}) {
  const { maxTokens = 800, temperature = 0.7 } = options;

  const body = JSON.stringify({
    model: 'mimo-v2.5',
    max_tokens: maxTokens,
    temperature,
    stream: true,
    messages
  });

  const EventEmitter = require('events');
  const emitter = new EventEmitter();

  const url = new URL(MIMO_API_URL);
  const req = https.request({
    hostname: url.hostname,
    path: url.pathname,
    method: 'POST',
    timeout: 50000,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + MIMO_API_KEY
    }
  }, (res) => {
    let buffer = '';

    res.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            emitter.emit('end');
            return;
          }
          try {
            const json = JSON.parse(data);
            const content = json.choices?.[0]?.delta?.content || '';
            if (content) {
              emitter.emit('data', content);
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    });

    res.on('end', () => {
      emitter.emit('end');
    });

    res.on('error', (err) => {
      emitter.emit('error', err);
    });
  });

  req.on('timeout', () => {
    req.destroy();
    emitter.emit('error', new Error('API timeout'));
  });
  req.on('error', (err) => {
    emitter.emit('error', err);
  });
  req.write(body);
  req.end();

  return emitter;
}

module.exports = { callMimo, callMimoStream, createMimoStream };
