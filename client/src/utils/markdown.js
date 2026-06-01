/**
 * 简单的 Markdown 转 HTML 工具
 * 支持：标题、粗体、斜体、代码块、行内代码、列表、链接、表格、换行
 */
export function markdownToHtml(md) {
  if (!md) return ''

  let html = md

  // 转义 HTML 特殊字符
  html = html.replace(/&/g, '&amp;')
  html = html.replace(/</g, '&lt;')
  html = html.replace(/>/g, '&gt;')

  // 代码块 ```...```
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
    return `<pre style="background:#f5f5f5;padding:16px;border-radius:8px;overflow-x:auto;margin:16px 0;"><code>${code.trim()}</code></pre>`
  })

  // 行内代码 `...`
  html = html.replace(/`([^`]+)`/g, '<code style="background:#f5f5f5;padding:4px 8px;border-radius:4px;font-size:14px;">$1</code>')

  // 表格
  html = html.replace(/^(\|.+\|)\n(\|[-:| ]+\|)\n((?:\|.+\|\n?)+)/gm, (match, header, separator, body) => {
    const headers = header.split('|').filter(h => h.trim()).map(h => h.trim())
    const rows = body.trim().split('\n').map(row => {
      return row.split('|').filter(cell => cell.trim()).map(cell => cell.trim())
    })

    let table = '<table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:14px;background:#fff;">'
    table += '<thead><tr>'
    headers.forEach(h => {
      table += `<th style="border:2px solid #333;padding:12px;background:#e8e8e8;text-align:left;font-weight:bold;color:#333;">${h}</th>`
    })
    table += '</tr></thead>'

    table += '<tbody>'
    rows.forEach((row, rowIndex) => {
      const bgColor = rowIndex % 2 === 0 ? '#fff' : '#e6f3ff'
      table += `<tr style="background:${bgColor};">`
      row.forEach(cell => {
        table += `<td style="border:2px solid #999;padding:10px 12px;color:#333;">${cell}</td>`
      })
      table += '</tr>'
    })
    table += '</tbody></table>'

    return table
  })

  // 标题
  html = html.replace(/^### (.+)$/gm, '<h3 style="font-size:16px;font-weight:bold;margin:20px 0 10px;">$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2 style="font-size:18px;font-weight:bold;margin:24px 0 12px;">$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1 style="font-size:20px;font-weight:bold;margin:28px 0 14px;">$1</h1>')

  // 粗体 **...**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

  // 斜体 *...*
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')

  // 链接 [...](...)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#4A90D9;" target="_blank">$1</a>')

  // 无序列表 - 或 *
  html = html.replace(/^[\-\*] (.+)$/gm, '<li style="margin-left:20px;">$1</li>')

  // 有序列表 1. 2. 3.
  html = html.replace(/^\d+\. (.+)$/gm, '<li style="margin-left:20px;">$1</li>')

  // 换行：两个换行变成段落
  html = html.replace(/\n\n/g, '</p><p style="margin:12px 0;">')

  // 单个换行变成 <br>
  html = html.replace(/\n/g, '<br>')

  // 包裹在段落中
  html = '<p style="margin:12px 0;">' + html + '</p>'

  // 清理空段落
  html = html.replace(/<p[^>]*><\/p>/g, '')

  return html
}
