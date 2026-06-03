<template>
  <div class="share-container">
    <!-- 头部 -->
    <header class="header">
      <h1 class="title">📚 分享的学习笔记</h1>
    </header>

    <!-- 内容 -->
    <div class="content" v-loading="loading">
      <div v-if="report" class="report-content">
        <div class="stats">
          <span>{{ report.date_key }}</span>
          <span>{{ report.topic_count }} 个主题</span>
          <span>{{ report.total_turns }} 条对话</span>
        </div>

        <!-- 思维导图 -->
        <div class="mind-map-container" v-if="report.tree">
          <svg
            ref="svgRef"
            class="mind-map-svg"
            :viewBox="viewBox"
          >
            <g :transform="`translate(${panX}, ${panY}) scale(${scale})`">
              <path
                v-for="(link, index) in links"
                :key="'link-' + index"
                :d="link.path"
                fill="none"
                :stroke="link.color"
                stroke-width="2"
              />
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

      <el-empty v-if="!loading && !report" description="笔记不存在或链接已过期">
        <el-button type="primary" @click="router.push('/')">返回首页</el-button>
      </el-empty>
    </div>

    <!-- 节点详情 -->
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
import { report } from '../utils/api'

const router = useRouter()
const route = useRoute()

const reportData = ref(null)
const loading = ref(false)
const svgRef = ref(null)
const showNodeDetail = ref(false)
const selectedNode = ref(null)
const expandedNodes = ref(new Set(['root']))

const LEVEL_COLORS = ['#4A90D9', '#5BA85B', '#E8A838', '#D94A4A', '#8B5CF6']

onMounted(() => {
  loadReport()
})

async function loadReport() {
  loading.value = true
  try {
    const token = route.params.token
    const res = await report.getShared(token)
    if (res.ok) {
      reportData.value = res.data
    }
  } catch (err) {
    console.error('load shared report error:', err)
  } finally {
    loading.value = false
  }
}

const nodes = computed(() => {
  if (!reportData.value?.tree) return []

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
      x, y,
      width: Math.max(nodeWidth, displayLabel.length * 14 + 20),
      height: nodeHeight,
      color,
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
        layout(child, level + 1, x + levelGap, startY + index * nodeGap, node.id)
      })
    }
  }

  layout(reportData.value.tree, 0, 80, 300, null)
  return result
})

const links = computed(() => {
  const result = []
  const nodeMap = {}
  nodes.value.forEach(n => { nodeMap[n.id] = n })

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
</script>

<style scoped>
.share-container {
  min-height: 100vh;
  background: #f5f5f5;
}

.header {
  background: #52c41a;
  padding: 16px 20px;
  color: #fff;
  text-align: center;
}

.title {
  font-size: 20px;
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
}

.mind-map-svg {
  width: 100%;
  height: 500px;
}

.text-version {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
}

.text-version h3 {
  margin: 0 0 16px;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .title {
    font-size: 18px;
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
