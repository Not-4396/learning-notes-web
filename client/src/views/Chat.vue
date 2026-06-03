<template>
  <div class="chat-container">
    <!-- 头部 -->
    <header class="header">
      <div class="header-content">
        <el-button @click="router.push('/')" text class="back-btn">← 返回</el-button>
        <h1 class="title">AI 学习助手</h1>
        <div class="header-actions">
          <el-button @click="handleClear" text>清空</el-button>
          <el-button @click="handleGenerate" text type="primary">生成笔记</el-button>
        </div>
      </div>
    </header>

    <!-- 消息列表 -->
    <div class="message-list" ref="messageListRef">
      <!-- 欢迎信息 -->
      <div v-if="messages.length === 0" class="welcome">
        <div class="welcome-icon"> </div>
        <h2>你好！我是AI学习助手</h2>
        <p>有什么问题都可以问我</p>
      </div>

      <!-- 消息 -->
      <div
        v-for="(msg, index) in messages"
        :key="index"
        class="message"
        :class="msg.role"
      >
        <div class="avatar" :class="msg.role">
          {{ msg.role === 'user' ? '我' : 'AI' }}
        </div>
        <div class="bubble">
          <div v-if="msg.role === 'user'" class="content">{{ msg.content }}</div>
          <div v-else class="content" v-html="msg.html || msg.content"></div>
        </div>
      </div>

      <!-- 加载中 -->
      <div v-if="loading" class="message assistant">
        <div class="avatar ai">AI</div>
        <div class="bubble">
          <div class="content typing">
            <span class="dot">.</span>
            <span class="dot">.</span>
            <span class="dot">.</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 输入区域 -->
    <div class="input-area">
      <el-input
        v-model="inputText"
        placeholder="输入你的问题..."
        size="large"
        @keyup.enter="handleSend"
        :disabled="loading"
      >
        <template #append>
          <el-button @click="handleSend" :disabled="loading || !inputText.trim()">
            发送
          </el-button>
        </template>
      </el-input>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { chat, summary, sendMessage } from '../utils/api'
import { markdownToHtml } from '../utils/markdown'

const router = useRouter()
const messages = ref([])
const inputText = ref('')
const loading = ref(false)
const messageListRef = ref(null)

onMounted(() => {
  checkHistory()
})

async function checkHistory() {
  try {
    const res = await chat.getHistory(50)
    if (res.ok && res.messages.length > 0) {
      const count = res.messages.length
      try {
        await ElMessageBox.confirm(
          `你有 ${count} 条历史对话，是否继续上次的知识旅程？`,
          '欢迎回来',
          {
            confirmText: '继续',
            cancelText: '新对话',
            type: 'info'
          }
        )
        // 加载历史
        loadHistory(res.messages)
      } catch {
        // 选择新对话
      }
    }
  } catch (err) {
    console.error('check history error:', err)
  }
}

function loadHistory(historyMessages) {
  messages.value = historyMessages.map(m => ({
    role: m.role,
    content: m.content,
    html: m.role === 'assistant' ? markdownToHtml(m.content) : ''
  }))
  scrollToBottom()
}

async function handleSend() {
  const text = inputText.value.trim()
  if (!text || loading.value) return

  // 添加用户消息
  messages.value.push({ role: 'user', content: text })
  inputText.value = ''
  loading.value = true
  scrollToBottom()

  try {
    const res = await sendMessage(text)
    loading.value = false

    if (res.ok) {
      messages.value.push({
        role: 'assistant',
        content: res.reply,
        html: markdownToHtml(res.reply)
      })
    } else {
      messages.value.push({
        role: 'error',
        content: '错误: ' + res.error,
        html: `<p style="color:#ff4d4f;">错误: ${res.error}</p>`
      })
      ElMessage.error(res.error)
    }
    scrollToBottom()
  } catch (err) {
    loading.value = false
    messages.value.push({
      role: 'error',
      content: '请求失败',
      html: '<p style="color:#ff4d4f;">请求失败</p>'
    })
    ElMessage.error('请求失败')
  }
}

function handleClear() {
  ElMessageBox.confirm('确定清空所有对话？', '提示', {
    type: 'warning'
  }).then(() => {
    messages.value = []
  }).catch(() => {})
}

async function handleGenerate() {
  const today = new Date().toISOString().slice(0, 10)
  try {
    await ElMessageBox.confirm(`生成 ${today} 的学习笔记？`, '生成笔记')
    const res = await summary.generate(today)
    if (res.ok) {
      ElMessage.success('开始生成，请稍候...')
      // 轮询等待完成
      const result = await pollGenerate(res.task_id)
      ElMessage.success(`生成完成: ${result.topic_count} 个主题`)
    } else {
      ElMessage.error(res.error || '生成失败')
    }
  } catch (err) {
    if (err !== 'cancel') {
      ElMessage.error('生成失败')
    }
  }
}

function pollGenerate(taskId) {
  return new Promise((resolve, reject) => {
    let count = 0
    const maxCount = 40

    const check = async () => {
      if (count >= maxCount) {
        reject(new Error('生成超时'))
        return
      }
      count++

      try {
        const res = await summary.poll(taskId)
        if (res.ok) {
          if (res.status === 'done') {
            resolve(res.result)
          } else if (res.status === 'error') {
            reject(new Error(res.result?.error || '生成失败'))
          } else {
            setTimeout(check, 3000)
          }
        } else {
          setTimeout(check, 3000)
        }
      } catch (err) {
        setTimeout(check, 3000)
      }
    }

    check()
  })
}

function scrollToBottom() {
  nextTick(() => {
    if (messageListRef.value) {
      messageListRef.value.scrollTop = messageListRef.value.scrollHeight
    }
  })
}
</script>

<style scoped>
.chat-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f5f5f5;
}

.header {
  background: #4A90D9;
  padding: 12px 20px;
  color: #fff;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.back-btn {
  color: #fff;
}

.title {
  font-size: 18px;
  margin: 0;
}

.header-actions .el-button {
  color: #fff;
}

.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.welcome {
  text-align: center;
  padding: 100px 0;
}

.welcome-icon {
  font-size: 64px;
  margin-bottom: 16px;
}

.welcome h2 {
  font-size: 20px;
  color: #333;
  margin: 0 0 8px;
}

.welcome p {
  color: #999;
  margin: 0;
}

.message {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}

.message.user {
  flex-direction: row-reverse;
}

.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  flex-shrink: 0;
}

.avatar.user {
  background: #4A90D9;
  color: #fff;
}

.avatar.ai {
  background: #52c41a;
  color: #fff;
}

.bubble {
  max-width: 70%;
  padding: 12px 16px;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.message.user .bubble {
  background: #4A90D9;
  color: #fff;
}

.content {
  font-size: 15px;
  line-height: 1.6;
  word-break: break-word;
}

.typing .dot {
  animation: blink 1.4s infinite both;
  font-size: 24px;
  line-height: 1;
}

.typing .dot:nth-child(2) {
  animation-delay: 0.2s;
}

.typing .dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes blink {
  0%, 80%, 100% { opacity: 0; }
  40% { opacity: 1; }
}

.input-area {
  padding: 16px 20px;
  background: #fff;
  border-top: 1px solid #eee;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .header-content {
    flex-wrap: wrap;
    gap: 8px;
  }

  .back-btn {
    order: 1;
  }

  .title {
    order: 2;
    font-size: 16px;
  }

  .header-actions {
    order: 3;
    display: flex;
    gap: 8px;
  }

  .welcome {
    padding: 60px 20px;
  }

  .welcome-icon {
    font-size: 48px;
  }

  .welcome h2 {
    font-size: 18px;
  }

  .message-list {
    padding: 15px;
  }

  .message {
    gap: 8px;
    margin-bottom: 15px;
  }

  .avatar {
    width: 32px;
    height: 32px;
    font-size: 12px;
  }

  .bubble {
    max-width: 80%;
    padding: 10px 14px;
  }

  .content {
    font-size: 14px;
  }

  .input-area {
    padding: 12px 15px;
  }
}
</style>
