<template>
  <div class="home-container">
    <!-- 头部 -->
    <header class="header">
      <div class="header-content">
        <div class="user-info" v-if="user">
          <div class="avatar">{{ user.nickname?.[0] || user.username[0] }}</div>
          <span class="username">{{ user.nickname || user.username }}</span>
        </div>
        <h1 class="logo">📚 学习笔记</h1>
        <div class="header-actions">
          <el-button @click="router.push('/import')" text>导入</el-button>
          <el-button @click="handleLogout" text>退出</el-button>
        </div>
      </div>
    </header>

    <!-- 操作按钮 -->
    <div class="action-btns">
      <el-button type="success" size="large" @click="router.push('/chat')">
        💬 AI 对话
      </el-button>
      <el-button type="primary" size="large" @click="handleGenerate">
        ✨ 生成笔记
      </el-button>
      <el-button type="warning" size="large" @click="router.push('/history')">
        📋 历史笔记
      </el-button>
    </div>

    <!-- 笔记列表 -->
    <div class="note-list" v-loading="loading">
      <div
        v-for="note in notes"
        :key="note.date_key"
        class="note-card"
        @click="router.push(`/report/${note.date_key}`)"
      >
        <div class="note-left">
          <div class="note-date">{{ formatDate(note.date_key) }}</div>
          <div class="note-key">{{ note.date_key }}</div>
        </div>
        <div class="note-right">
          <div class="stat">
            <span class="stat-num">{{ note.topic_count }}</span>
            <span class="stat-label">主题</span>
          </div>
          <div class="stat">
            <span class="stat-num">{{ note.total_turns }}</span>
            <span class="stat-label">对话</span>
          </div>
        </div>
      </div>

      <el-empty v-if="!loading && notes.length === 0" description="暂无学习笔记">
        <el-button type="primary" @click="router.push('/chat')">开始对话</el-button>
      </el-empty>
    </div>

    <!-- 生成对话框 -->
    <el-dialog v-model="showGenerateDialog" title="生成笔记" width="400px">
      <el-form>
        <el-form-item label="日期">
          <el-date-picker
            v-model="generateDate"
            type="date"
            placeholder="选择日期"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showGenerateDialog = false">取消</el-button>
        <el-button type="primary" :loading="generating" @click="confirmGenerate">
          生成
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { report, summary } from '../utils/api'

const router = useRouter()
const user = ref(null)
const notes = ref([])
const loading = ref(false)
const showGenerateDialog = ref(false)
const generateDate = ref(new Date().toISOString().slice(0, 10))
const generating = ref(false)

onMounted(() => {
  const userStr = localStorage.getItem('user')
  if (userStr) {
    user.value = JSON.parse(userStr)
  }
  loadNotes()
})

async function loadNotes() {
  loading.value = true
  try {
    const res = await report.getList(1, 100)
    if (res.ok) {
      notes.value = res.data || []
    }
  } catch (err) {
    console.error('load notes error:', err)
  } finally {
    loading.value = false
  }
}

function formatDate(dateStr) {
  const date = new Date(dateStr)
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const month = date.getMonth() + 1
  const day = date.getDate()
  const weekday = weekdays[date.getDay()]
  return `${month}月${day}日 ${weekday}`
}

function handleGenerate() {
  generateDate.value = new Date().toISOString().slice(0, 10)
  showGenerateDialog.value = true
}

async function confirmGenerate() {
  generating.value = true
  try {
    const res = await summary.generate(generateDate.value)
    if (res.ok) {
      const taskId = res.task_id
      // 轮询等待生成完成
      await pollGenerate(taskId)
      ElMessage.success('生成完成')
      loadNotes()
      showGenerateDialog.value = false
    } else {
      ElMessage.error(res.error || '生成失败')
    }
  } catch (err) {
    ElMessage.error('生成失败')
  } finally {
    generating.value = false
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

function handleLogout() {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  router.push('/login')
}
</script>

<style scoped>
.home-container {
  min-height: 100vh;
  background: #f5f5f5;
}

.header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
  color: #fff;
}

.header-content {
  max-width: 800px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
}

.username {
  font-size: 14px;
}

.logo {
  font-size: 20px;
  font-weight: bold;
  margin: 0;
}

.header-actions .el-button {
  color: #fff;
}

.action-btns {
  max-width: 800px;
  margin: 20px auto;
  padding: 0 20px;
  display: flex;
  gap: 12px;
}

.action-btns .el-button {
  flex: 1;
  height: 56px;
  font-size: 16px;
}

.note-list {
  max-width: 800px;
  margin: 0 auto;
  padding: 0 20px 20px;
}

.note-card {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  transition: box-shadow 0.2s;
}

.note-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.note-date {
  font-size: 16px;
  font-weight: 500;
  color: #333;
}

.note-key {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
}

.note-right {
  display: flex;
  gap: 24px;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stat-num {
  font-size: 24px;
  font-weight: bold;
  color: #667eea;
}

.stat-label {
  font-size: 12px;
  color: #999;
}
</style>
