<template>
  <div class="history-container">
    <!-- 头部 -->
    <header class="header">
      <div class="header-content">
        <el-button @click="router.push('/')" text class="back-btn">← 返回</el-button>
        <h1 class="title">历史笔记</h1>
      </div>
    </header>

    <!-- 列表 -->
    <div class="content" v-loading="loading">
      <div class="note-list">
        <div
          v-for="note in notes"
          :key="note.date_key"
          class="note-card"
          @click="router.push(`/report/${note.date_key}`)"
        >
          <div class="note-header">
            <div class="note-date">
              <span class="date-icon">📅</span>
              <span class="date-text">{{ formatDate(note.date_key) }}</span>
            </div>
            <div class="note-stats">
              <span>{{ note.topic_count }} 个主题</span>
              <span class="divider">·</span>
              <span>{{ note.total_turns }} 条对话</span>
            </div>
          </div>

          <div class="note-topics" v-if="note.topics?.length">
            <span
              v-for="topic in note.topics"
              :key="topic"
              class="topic-tag"
            >
              {{ topic }}
            </span>
          </div>

          <div class="note-arrow">›</div>
        </div>
      </div>

      <!-- 加载更多 -->
      <div v-if="hasMore" class="load-more">
        <el-button @click="loadMore" :loading="loadingMore">
          加载更多
        </el-button>
      </div>

      <div v-if="!loading && notes.length === 0" class="empty">
        <el-empty description="还没有学习笔记">
          <el-button type="primary" @click="router.push('/')">返回首页</el-button>
        </el-empty>
      </div>

      <div v-if="!hasMore && notes.length > 0" class="bottom-tip">
        已加载全部笔记
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { report } from '../utils/api'

const router = useRouter()
const notes = ref([])
const loading = ref(false)
const loadingMore = ref(false)
const page = ref(1)
const hasMore = ref(true)

onMounted(() => {
  loadNotes()
})

async function loadNotes() {
  loading.value = true
  try {
    const res = await report.getList(1, 20)
    if (res.ok) {
      notes.value = (res.data || []).map(item => ({
        ...item,
        topics: (item.tree?.children || []).slice(0, 3).map(t => t.label)
      }))
      page.value = 2
      hasMore.value = (res.data || []).length >= 20
    }
  } catch (err) {
    console.error('load notes error:', err)
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  if (loadingMore.value || !hasMore.value) return

  loadingMore.value = true
  try {
    const res = await report.getList(page.value, 20)
    if (res.ok) {
      const newNotes = (res.data || []).map(item => ({
        ...item,
        topics: (item.tree?.children || []).slice(0, 3).map(t => t.label)
      }))
      notes.value.push(...newNotes)
      page.value++
      hasMore.value = newNotes.length >= 20
    }
  } catch (err) {
    console.error('load more error:', err)
  } finally {
    loadingMore.value = false
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
</script>

<style scoped>
.history-container {
  min-height: 100vh;
  background: #f5f5f5;
}

.header {
  background: #4A90D9;
  padding: 12px 20px;
  color: #fff;
}

.header-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.back-btn {
  color: #fff;
}

.title {
  font-size: 18px;
  margin: 0;
}

.content {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

.note-card {
  background: #fff;
  border-radius: 12px;
  padding: 16px 20px;
  margin-bottom: 12px;
  cursor: pointer;
  transition: box-shadow 0.2s;
  position: relative;
}

.note-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.note-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.note-date {
  display: flex;
  align-items: center;
  gap: 8px;
}

.date-icon {
  font-size: 18px;
}

.date-text {
  font-size: 16px;
  font-weight: 500;
  color: #333;
}

.note-stats {
  font-size: 13px;
  color: #999;
}

.divider {
  margin: 0 8px;
}

.note-topics {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.topic-tag {
  font-size: 12px;
  color: #667eea;
  background: rgba(102, 126, 234, 0.1);
  padding: 4px 12px;
  border-radius: 12px;
}

.note-arrow {
  position: absolute;
  right: 20px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 24px;
  color: #ccc;
}

.load-more {
  text-align: center;
  padding: 20px;
}

.bottom-tip {
  text-align: center;
  padding: 20px;
  color: #ccc;
  font-size: 13px;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .content {
    padding: 15px;
  }

  .note-card {
    padding: 14px 16px;
  }

  .note-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .note-stats {
    font-size: 12px;
  }

  .note-arrow {
    right: 16px;
    font-size: 20px;
  }
}
</style>
