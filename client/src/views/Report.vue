<template>
  <div class="report-container">
    <!-- 头部 -->
    <header class="header">
      <div class="header-content">
        <el-button @click="router.push('/')" text class="back-btn">← 返回</el-button>
        <h1 class="title">{{ date }} 学习笔记</h1>
        <div class="header-actions">
          <el-dropdown @command="handleExport">
            <el-button text class="export-btn">导出 ▾</el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="image">导出图片</el-dropdown-item>
                <el-dropdown-item command="markdown">导出 Markdown</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-button @click="handleShare" text>分享</el-button>
        </div>
      </div>
    </header>

    <!-- 内容 -->
    <div class="content" v-loading="loading">
      <div v-if="report" class="report-content">
        <!-- 统计信息 -->
        <div class="stats">
          <span>{{ report.topic_count }} 个主题</span>
          <span>{{ report.total_turns }} 条对话</span>
        </div>

        <!-- 思维导图 -->
        <div class="mind-map-container" v-if="report.tree">
          <svg
            ref="svgRef"
            class="mind-map-svg"
            :viewBox="viewBox"
            @mousedown="handleMouseDown"
            @mousemove="handleMouseMove"
            @mouseup="handleMouseUp"
            @wheel="handleWheel"
          >
            <g :transform="`translate(${panX}, ${panY}) scale(${scale})`">
              <!-- 连接线 -->
              <path
                v-for="(link, index) in links"
                :key="'link-' + index"
                :d="link.path"
                fill="none"
                :stroke="link.color"
                stroke-width="2"
              />
              <!-- 节点 -->
              <g
                v-for="(node, index) in nodes"
                :key="'node-' + index"
                :transform="`translate(${node.x}, ${node.y})`"
                @click="handleNodeClick(node)"
                style="cursor: pointer;"
              >
                <rect
                  :x="-node.width / 2"
                  :y="-node.height / 2"
                  :width="node.width"
                  :height="node.height"
                  :rx="8"
                  :fill="node.color"
                  :stroke="node.borderColor"
                  stroke-width="2"
                />
                <text
                  x="0"
                  y="0"
                  text-anchor="middle"
                  dominant-baseline="middle"
                  fill="#fff"
                  :font-size="node.fontSize"
                  font-weight="500"
                >
                  {{ node.label }}
                </text>
                <!-- 展开/折叠按钮 -->
                <circle
                  v-if="node.hasChildren"
                  :cx="node.width / 2"
                  cy="0"
                  r="10"
                  :fill="node.expanded ? '#ff6b6b' : '#51cf66'"
                  stroke="#fff"
                  stroke-width="2"
                  @click.stop="toggleNode(node)"
                />
                <text
                  v-if="node.hasChildren"
                  :x="node.width / 2"
                  y="0"
                  text-anchor="middle"
                  dominant-baseline="middle"
                  fill="#fff"
                  font-size="12"
                  font-weight="bold"
                  @click.stop="toggleNode(node)"
                >
                  {{ node.expanded ? '-' : '+' }}
                </text>
              </g>
            </g>
          </svg>
        </div>

        <!-- 文字版 -->
        <div class="text-version">
          <h3>文字版</h3>
          <div v-html="treeToHtml(report.tree)"></div>
        </div>
      </div>

      <el-empty v-if="!loading && !report" description="没有找到笔记">
        <el-button type="primary" @click="router.push('/')">返回首页</el-button>
      </el-empty>
    </div>

    <!-- 节点详情对话框 -->
    <el-dialog v-model="showNodeDetail" :title="selectedNode?.label" width="500px">
      <div v-if="selectedNode">
        <p v-if="selectedNode.summary"><strong>总结：</strong>{{ selectedNode.summary }}</p>
        <p v-if="selectedNode.detail"><strong>详情：</strong>{{ selectedNode.detail }}</p>
        <div v-if="selectedNode.children?.length">
          <h4>子知识点：</h4>
          <ul>
            <li v-for="child in selectedNode.children" :key="child.id">
              {{ child.label }}
            </li>
          </ul>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { report as reportApi } from '../utils/api'

const router = useRouter()
const route = useRoute()

const date = ref(route.params.date)
const report = ref(null)
const loading = ref(false)
const svgRef = ref(null)

// 思维导图状态
const scale = ref(1)
const panX = ref(0)
const panY = ref(0)
let isDragging = false
let startX = 0
let startY = 0

// 节点详情
const showNodeDetail = ref(false)
const selectedNode = ref(null)

// 展开/折叠状态
const expandedNodes = ref(new Set(['root']))

const LEVEL_COLORS = ['#4A90D9', '#5BA85B', '#E8A838', '#D94A4A', '#8B5CF6']

onMounted(() => {
  loadReport()
})

async function loadReport() {
  loading.value = true
  try {
    const res = await reportApi.get(date.value)
    if (res.ok) {
      report.value = res.data
    }
  } catch (err) {
    console.error('load report error:', err)
  } finally {
    loading.value = false
  }
}

// 计算节点布局
const nodes = computed(() => {
  if (!report.value?.tree) return []

  const result = []
  const nodeWidth = 120
  const nodeHeight = 36
  const levelGap = 180
  const nodeGap = 50

  function layout(node, level, x, y, parentId) {
    const color = LEVEL_COLORS[level % LEVEL_COLORS.length]
    const expanded = expandedNodes.value.has(node.id)
    const hasChildren = node.children && node.children.length > 0

    const displayLabel = node.label.length > 8 ? node.label.slice(0, 8) + '...' : node.label

    result.push({
      id: node.id,
      label: displayLabel,
      fullLabel: node.label,
      x,
      y,
      width: Math.max(nodeWidth, displayLabel.length * 14 + 20),
      height: nodeHeight,
      color,
      borderColor: color,
      fontSize: level === 0 ? 14 : 12,
      hasChildren,
      expanded,
      level,
      parentId,
      summary: node.summary,
      detail: node.detail,
      children: node.children,
      originalNode: node
    })

    if (hasChildren && expanded) {
      const childCount = node.children.length
      const totalHeight = (childCount - 1) * nodeGap
      let startY = y - totalHeight / 2

      node.children.forEach((child, index) => {
        const childY = startY + index * nodeGap
        const childX = x + levelGap
        layout(child, level + 1, childX, childY, node.id)
      })
    }
  }

  layout(report.value.tree, 0, 80, 300, null)
  return result
})

// 计算连接线
const links = computed(() => {
  const result = []
  const nodeMap = {}

  nodes.value.forEach(n => {
    nodeMap[n.id] = n
  })

  nodes.value.forEach(node => {
    if (node.parentId && nodeMap[node.parentId]) {
      const parent = nodeMap[node.parentId]
      const startX = parent.x + parent.width / 2
      const startY = parent.y
      const endX = node.x - node.width / 2
      const endY = node.y

      const midX = (startX + endX) / 2

      result.push({
        path: `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`,
        color: parent.color
      })
    }
  })

  return result
})

// 计算 viewBox
const viewBox = computed(() => {
  if (nodes.value.length === 0) return '0 0 800 600'

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  nodes.value.forEach(n => {
    minX = Math.min(minX, n.x - n.width / 2 - 20)
    minY = Math.min(minY, n.y - n.height / 2 - 20)
    maxX = Math.max(maxX, n.x + n.width / 2 + 20)
    maxY = Math.max(maxY, n.y + n.height / 2 + 20)
  })

  return `${minX} ${minY} ${maxX - minX} ${maxY - minY}`
})

function toggleNode(node) {
  if (expandedNodes.value.has(node.id)) {
    expandedNodes.value.delete(node.id)
  } else {
    expandedNodes.value.add(node.id)
  }
}

function handleNodeClick(node) {
  selectedNode.value = node.originalNode || node
  showNodeDetail.value = true
}

// 拖拽和缩放
function handleMouseDown(e) {
  isDragging = true
  startX = e.clientX - panX.value
  startY = e.clientY - panY.value
}

function handleMouseMove(e) {
  if (isDragging) {
    panX.value = e.clientX - startX
    panY.value = e.clientY - startY
  }
}

function handleMouseUp() {
  isDragging = false
}

function handleWheel(e) {
  e.preventDefault()
  const delta = e.deltaY > 0 ? 0.9 : 1.1
  scale.value = Math.max(0.3, Math.min(3, scale.value * delta))
}

// 导出图片
async function handleExport(command) {
  if (command === 'image') {
    try {
      const svg = svgRef.value
      const svgData = new XMLSerializer().serializeToString(svg)
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(svgBlob)

      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width * 2
        canvas.height = img.height * 2
        const ctx = canvas.getContext('2d')
        ctx.scale(2, 2)
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, img.width, img.height)
        ctx.drawImage(img, 0, 0)

        const link = document.createElement('a')
        link.download = `学习笔记_${date.value}.png`
        link.href = canvas.toDataURL('image/png')
        link.click()

        URL.revokeObjectURL(url)
        ElMessage.success('图片已保存')
      }
      img.src = url
    } catch (err) {
      ElMessage.error('导出失败')
    }
  } else if (command === 'markdown') {
    const md = treeToMarkdown(report.value.tree, 0)
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.download = `学习笔记_${date.value}.md`
    link.href = url
    link.click()
    URL.revokeObjectURL(url)
    ElMessage.success('Markdown 已保存')
  }
}

// 生成分享链接
async function handleShare() {
  try {
    const res = await reportApi.share(date.value)
    if (res.ok) {
      const shareUrl = `${window.location.origin}/share/${res.share_token}`
      await navigator.clipboard.writeText(shareUrl)
      ElMessage.success('分享链接已复制到剪贴板')
    } else {
      ElMessage.error(res.error || '生成分享链接失败')
    }
  } catch (err) {
    ElMessage.error('生成分享链接失败')
  }
}

// 树转 HTML
function treeToHtml(node, depth = 0) {
  if (!node) return ''

  let html = ''
  if (depth === 0) {
    html += `<h2>${node.label || '学习笔记'}</h2>`
  } else if (depth === 1) {
    html += `<h3 style="color:#4A90D9;margin-top:20px;">${node.label}</h3>`
    if (node.summary) html += `<p style="color:#666;">${node.summary}</p>`
  } else if (depth === 2) {
    html += `<h4 style="color:#5BA85B;margin-top:16px;">${node.label}</h4>`
    if (node.summary) html += `<p>${node.summary}</p>`
  } else {
    html += `<li><strong>${node.label}</strong>`
    if (node.detail) html += `：${node.detail}`
    html += `</li>`
  }

  if (node.children?.length) {
    if (depth >= 2) html += '<ul>'
    node.children.forEach(child => {
      html += treeToHtml(child, depth + 1)
    })
    if (depth >= 2) html += '</ul>'
  }

  return html
}

// 树转 Markdown
function treeToMarkdown(node, depth = 0) {
  if (!node) return ''

  let md = ''
  if (depth === 0) {
    md += `# ${node.label || '学习笔记'}\n\n`
  } else if (depth === 1) {
    md += `## ${node.label}\n`
    if (node.summary) md += `> ${node.summary}\n\n`
  } else if (depth === 2) {
    md += `### ${node.label}\n`
    if (node.summary) md += `${node.summary}\n\n`
  } else {
    md += `${'  '.repeat(depth - 3)}- **${node.label}**`
    if (node.detail) md += `：${node.detail}`
    md += '\n'
  }

  if (node.children?.length) {
    node.children.forEach(child => {
      md += treeToMarkdown(child, depth + 1)
    })
  }

  if (depth === 0 || depth === 1) md += '\n'
  return md
}
</script>

<style scoped>
.report-container {
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
  justify-content: space-between;
  align-items: center;
}

.back-btn, .export-btn {
  color: #fff;
}

.title {
  font-size: 18px;
  margin: 0;
}

.content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.stats {
  background: #fff;
  padding: 12px 20px;
  border-radius: 8px;
  margin-bottom: 16px;
  display: flex;
  gap: 24px;
  color: #666;
}

.mind-map-container {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 16px;
  overflow: hidden;
}

.mind-map-svg {
  width: 100%;
  height: 500px;
  cursor: grab;
}

.mind-map-svg:active {
  cursor: grabbing;
}

.text-version {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
}

.text-version h3 {
  margin: 0 0 16px;
  color: #333;
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
    width: 100%;
    text-align: center;
  }

  .header-actions {
    order: 3;
    width: 100%;
    display: flex;
    justify-content: center;
    gap: 10px;
  }

  .content {
    padding: 15px;
  }

  .stats {
    flex-direction: column;
    gap: 8px;
    padding: 10px 15px;
  }

  .mind-map-container {
    padding: 10px;
  }

  .mind-map-svg {
    height: 300px;
  }

  .text-version {
    padding: 15px;
  }
}
</style>
