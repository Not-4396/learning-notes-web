<template>
  <div class="radar-chart-container">
    <canvas ref="canvasRef" :width="size" :height="size"></canvas>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, nextTick } from 'vue'

const props = defineProps({
  scores: {
    type: Object,
    default: () => ({})
  },
  size: {
    type: Number,
    default: 300
  },
  animated: {
    type: Boolean,
    default: true
  }
})

const canvasRef = ref(null)
const CATEGORIES = ['财经', '历史', '政治', '艺术', '科技', '自然']
const LEVEL_COLORS = ['#4A90D9', '#5BA85B', '#E8A838', '#D94A4A', '#8B5CF6', '#EC4899']

onMounted(() => {
  draw()
})

watch(() => props.scores, () => {
  nextTick(() => draw())
}, { deep: true })

function draw() {
  const canvas = canvasRef.value
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  const size = props.size
  const center = { x: size / 2, y: size / 2 }
  const maxRadius = size / 2 - 40
  const levels = 5
  const angles = [0, 60, 120, 180, 240, 300].map(a => a * Math.PI / 180)

  // 清空画布
  ctx.clearRect(0, 0, size, size)

  // 绘制背景网格
  drawGrid(ctx, center, maxRadius, levels, angles)

  // 绘制坐标轴
  drawAxes(ctx, center, maxRadius, angles)

  // 绘制标签
  drawLabels(ctx, center, maxRadius, angles)

  // 绘制数据区域
  if (props.animated) {
    drawAnimated(ctx, center, maxRadius, angles)
  } else {
    drawData(ctx, center, maxRadius, angles)
    drawPoints(ctx, center, maxRadius, angles)
  }
}

function drawGrid(ctx, center, maxRadius, levels, angles) {
  ctx.strokeStyle = '#E5E5E5'
  ctx.lineWidth = 1

  for (let i = 1; i <= levels; i++) {
    const r = maxRadius * i / levels
    ctx.beginPath()
    angles.forEach((angle, idx) => {
      const point = getPoint(center, r, angle)
      idx === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)
    })
    ctx.closePath()
    ctx.stroke()
  }
}

function drawAxes(ctx, center, maxRadius, angles) {
  ctx.strokeStyle = '#CCCCCC'
  ctx.lineWidth = 1

  angles.forEach(angle => {
    ctx.beginPath()
    ctx.moveTo(center.x, center.y)
    const point = getPoint(center, maxRadius, angle)
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
  })
}

function drawLabels(ctx, center, maxRadius, angles) {
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  angles.forEach((angle, idx) => {
    const labelRadius = maxRadius + 25
    const point = getPoint(center, labelRadius, angle)

    // 根据位置调整对齐方式
    if (angle === 0) {
      ctx.textAlign = 'left'
    } else if (angle === Math.PI) {
      ctx.textAlign = 'right'
    } else {
      ctx.textAlign = 'center'
    }

    // 绘制分类名称
    ctx.fillStyle = '#333333'
    ctx.font = '12px sans-serif'
    ctx.fillText(CATEGORIES[idx], point.x, point.y)

    // 绘制分数
    const score = props.scores[CATEGORIES[idx]] || 0
    ctx.fillStyle = '#4A90D9'
    ctx.font = 'bold 14px sans-serif'
    ctx.fillText(score, point.x, point.y + 16)
  })
}

function drawData(ctx, center, maxRadius, angles) {
  ctx.beginPath()
  CATEGORIES.forEach((cat, idx) => {
    const score = props.scores[cat] || 0
    const r = maxRadius * score / 100
    const point = getPoint(center, r, angles[idx])
    idx === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)
  })
  ctx.closePath()

  // 填充
  ctx.fillStyle = 'rgba(74, 144, 217, 0.3)'
  ctx.fill()

  // 边框
  ctx.strokeStyle = '#4A90D9'
  ctx.lineWidth = 2
  ctx.stroke()
}

function drawPoints(ctx, center, maxRadius, angles) {
  CATEGORIES.forEach((cat, idx) => {
    const score = props.scores[cat] || 0
    const r = maxRadius * score / 100
    const point = getPoint(center, r, angles[idx])

    // 绘制点
    ctx.beginPath()
    ctx.arc(point.x, point.y, 4, 0, Math.PI * 2)
    ctx.fillStyle = '#4A90D9'
    ctx.fill()
    ctx.strokeStyle = '#FFFFFF'
    ctx.lineWidth = 2
    ctx.stroke()
  })
}

function drawAnimated(ctx, center, maxRadius, angles) {
  let progress = 0
  const duration = 1000
  const startTime = Date.now()

  const animate = () => {
    progress = Math.min((Date.now() - startTime) / duration, 1)
    const easeProgress = easeOutCubic(progress)

    // 清空并重绘
    ctx.clearRect(0, 0, props.size, props.size)
    drawGrid(ctx, center, maxRadius, 5, angles)
    drawAxes(ctx, center, maxRadius, angles)
    drawLabels(ctx, center, maxRadius, angles)

    // 绘制动画中的数据
    ctx.beginPath()
    CATEGORIES.forEach((cat, idx) => {
      const score = (props.scores[cat] || 0) * easeProgress
      const r = maxRadius * score / 100
      const point = getPoint(center, r, angles[idx])
      idx === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)
    })
    ctx.closePath()
    ctx.fillStyle = 'rgba(74, 144, 217, 0.3)'
    ctx.fill()
    ctx.strokeStyle = '#4A90D9'
    ctx.lineWidth = 2
    ctx.stroke()

    // 绘制动画中的点
    CATEGORIES.forEach((cat, idx) => {
      const score = (props.scores[cat] || 0) * easeProgress
      const r = maxRadius * score / 100
      const point = getPoint(center, r, angles[idx])

      ctx.beginPath()
      ctx.arc(point.x, point.y, 4, 0, Math.PI * 2)
      ctx.fillStyle = '#4A90D9'
      ctx.fill()
      ctx.strokeStyle = '#FFFFFF'
      ctx.lineWidth = 2
      ctx.stroke()
    })

    if (progress < 1) {
      setTimeout(animate, 16)
    }
  }

  animate()
}

function getPoint(center, radius, angle) {
  return {
    x: center.x + radius * Math.cos(angle - Math.PI / 2),
    y: center.y + radius * Math.sin(angle - Math.PI / 2)
  }
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3)
}
</script>

<style scoped>
.radar-chart-container {
  display: flex;
  justify-content: center;
  align-items: center;
}
</style>
