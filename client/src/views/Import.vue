<template>
  <div class="import-container">
    <!-- 头部 -->
    <header class="header">
      <div class="header-content">
        <el-button @click="router.push('/')" text class="back-btn">← 返回</el-button>
        <h1 class="title">导入对话</h1>
      </div>
    </header>

    <!-- 内容 -->
    <div class="content">
      <div class="import-card">
        <h3>导入方式</h3>
        <p>支持导入 JSONL 格式的对话记录文件</p>

        <el-upload
          class="upload-area"
          drag
          :auto-upload="false"
          :on-change="handleFileChange"
          :limit="1"
          accept=".jsonl,.json"
        >
          <el-icon class="upload-icon"><Upload /></el-icon>
          <div class="upload-text">拖拽文件到此处或<em>点击上传</em></div>
          <template #tip>
            <div class="upload-tip">支持 .jsonl 和 .json 格式文件</div>
          </template>
        </el-upload>

        <div v-if="fileContent" class="preview">
          <h4>预览（前 5 条）</h4>
          <div class="preview-list">
            <div v-for="(item, index) in previewItems" :key="index" class="preview-item">
              <span class="role" :class="item.role">{{ item.role === 'user' ? '用户' : 'AI' }}</span>
              <span class="content">{{ item.content.slice(0, 100) }}{{ item.content.length > 100 ? '...' : '' }}</span>
            </div>
          </div>
          <p class="preview-count">共 {{ parsedItems.length }} 条对话记录</p>
        </div>

        <el-button
          type="primary"
          size="large"
          :loading="importing"
          :disabled="!fileContent"
          @click="handleImport"
          class="import-btn"
        >
          开始导入
        </el-button>
      </div>

      <!-- 格式说明 -->
      <div class="format-card">
        <h3>JSONL 格式说明</h3>
        <p>每行一个 JSON 对象，包含以下字段：</p>
        <pre><code>{
  "role": "user",        // "user" 或 "assistant"
  "content": "消息内容",
  "date_key": "2024-01-01",  // 可选，默认今天
  "timestamp": "2024-01-01T12:00:00Z"  // 可选
}</code></pre>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { importData } from '../utils/api'

const router = useRouter()
const fileContent = ref('')
const parsedItems = ref([])
const importing = ref(false)

const previewItems = computed(() => parsedItems.value.slice(0, 5))

function handleFileChange(file) {
  const reader = new FileReader()
  reader.onload = (e) => {
    fileContent.value = e.target.result
    parseFile()
  }
  reader.readAsText(file.raw)
}

function parseFile() {
  try {
    const lines = fileContent.value.split('\n').filter(line => line.trim())
    const items = []

    for (const line of lines) {
      try {
        const item = JSON.parse(line)
        if (item.role && item.content) {
          items.push({
            role: item.role,
            content: item.content,
            date_key: item.date_key || new Date().toISOString().slice(0, 10),
            timestamp: item.timestamp || new Date().toISOString()
          })
        }
      } catch (e) {
        // 跳过解析失败的行
      }
    }

    parsedItems.value = items
  } catch (err) {
    ElMessage.error('文件格式错误')
    parsedItems.value = []
  }
}

async function handleImport() {
  if (parsedItems.value.length === 0) {
    ElMessage.warning('没有可导入的数据')
    return
  }

  importing.value = true
  try {
    const res = await importData.conversations(parsedItems.value)
    if (res.ok) {
      ElMessage.success(`成功导入 ${res.imported} 条对话记录`)
      router.push('/')
    } else {
      ElMessage.error(res.error || '导入失败')
    }
  } catch (err) {
    ElMessage.error('导入失败')
  } finally {
    importing.value = false
  }
}
</script>

<style scoped>
.import-container {
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
  max-width: 600px;
  margin: 0 auto;
  padding: 20px;
}

.import-card, .format-card {
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 16px;
}

.import-card h3, .format-card h3 {
  margin: 0 0 8px;
  color: #333;
}

.import-card p, .format-card p {
  color: #666;
  margin: 0 0 16px;
}

.upload-area {
  margin-bottom: 16px;
}

.upload-icon {
  font-size: 48px;
  color: #c0c4cc;
}

.upload-text {
  color: #606266;
}

.upload-text em {
  color: #409eff;
  font-style: normal;
}

.upload-tip {
  font-size: 12px;
  color: #999;
}

.preview {
  margin-bottom: 16px;
}

.preview h4 {
  margin: 0 0 8px;
  color: #333;
}

.preview-list {
  background: #f5f5f5;
  border-radius: 8px;
  padding: 12px;
}

.preview-item {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
}

.preview-item:last-child {
  margin-bottom: 0;
}

.role {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  flex-shrink: 0;
}

.role.user {
  background: #4A90D9;
  color: #fff;
}

.role.assistant {
  background: #52c41a;
  color: #fff;
}

.content {
  color: #666;
  word-break: break-all;
}

.preview-count {
  margin: 8px 0 0;
  font-size: 13px;
  color: #999;
}

.import-btn {
  width: 100%;
}

.format-card pre {
  background: #f5f5f5;
  border-radius: 8px;
  padding: 12px;
  overflow-x: auto;
}

.format-card code {
  font-size: 13px;
  color: #333;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .content {
    padding: 15px;
  }

  .import-card, .format-card {
    padding: 18px;
  }

  .upload-icon {
    font-size: 36px;
  }
}
</style>
