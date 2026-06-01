# Learning Notes Web

AI 对话学习 · 知识树日报

## 本地开发

```bash
# 启动后端
cd server
npm install
npm run dev

# 启动前端（新终端）
cd client
npm install
npm run dev
```

访问 http://localhost:5173

---

## 部署到 Render（推荐）

### 优点
- ✅ 不需要信用卡
- ✅ 免费额度慷慨
- ✅ 配置简单

### 步骤

#### 1. 上传代码到 GitHub

```bash
# 在 learning-notes-web 目录下
git init
git add .
git commit -m "Initial commit"

# 在 GitHub 创建仓库后
git remote add origin https://github.com/你的用户名/learning-notes-web.git
git push -u origin main
```

#### 2. 部署后端

1. 注册 [Render](https://render.com)
2. 点击 "New" → "Web Service"
3. 连接 GitHub 仓库
4. 配置：
   - **Name**: learning-notes-server
   - **Root Directory**: server
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node index.js`
   - **Plan**: Free
5. 点击 "Create Web Service"
6. 等待部署完成，获取域名如 `https://learning-notes-server.onrender.com`

#### 3. 部署前端

1. 点击 "New" → "Static Site"
2. 连接同一个 GitHub 仓库
3. 配置：
   - **Name**: learning-notes-client
   - **Root Directory**: client
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: dist
4. 添加环境变量：
   - `VITE_API_BASE` = 你的后端地址（如 `https://learning-notes-server.onrender.com`）
5. 点击 "Create Static Site"
6. 等待部署完成，获取域名如 `https://learning-notes-client.onrender.com`

#### 4. 配置 CORS

部署完成后，需要修改后端代码允许前端域名访问：

```javascript
// server/index.js 中修改 CORS 配置
app.use(cors({
  origin: ['https://learning-notes-client.onrender.com']
}));
```

然后重新部署后端。

---

## 免费计划限制

| 限制 | 说明 |
|------|------|
| 休眠 | 15 分钟无请求后休眠 |
| 冷启动 | 首次请求需要 30 秒唤醒 |
| 存储 | 不支持持久化（重启后数据丢失） |

### 解决方案

1. **休眠问题**：可以用 UptimeRobot 等工具定时 ping 保持活跃
2. **数据持久化**：升级到 $7/月的付费计划，或使用外部数据库

---

## 功能

- ✅ 用户注册/登录
- ✅ AI 对话（支持 Markdown）
- ✅ 生成知识树笔记
- ✅ 思维导图展示（SVG）
- ✅ 历史笔记列表
- ✅ 分享链接
- ✅ 导出图片/Markdown
- ✅ 导入对话记录
