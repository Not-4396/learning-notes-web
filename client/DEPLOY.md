# Cloudflare Pages 部署指南

## 前提条件

1. Cloudflare 账号
2. 安装 Wrangler CLI：`npm install -g wrangler`

## 部署步骤

### 1. 登录 Cloudflare

```bash
wrangler login
```

### 2. 创建 D1 数据库

```bash
cd client
wrangler d1 create learning-notes-db
```

会输出类似：
```
[[d1_databases]]
binding = "DB"
database_name = "learning-notes-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

### 3. 更新 wrangler.toml

把上面输出的 `database_id` 填入 `wrangler.toml`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "learning-notes-db"
database_id = "你的数据库ID"
```

### 4. 初始化数据库表

```bash
wrangler d1 execute learning-notes-db --file=./schema.sql
```

### 5. 设置环境变量

在 Cloudflare Dashboard 中设置：
- `MIMO_API_KEY`：你的小米 MIMO API Key
- `JWT_SECRET`：一个随机密钥

或者使用命令行：
```bash
wrangler secret put MIMO_API_KEY
wrangler secret put JWT_SECRET
```

### 6. 部署

```bash
npm install
npm run build
wrangler pages deploy dist --project-name=learning-notes-web
```

### 7. 配置自定义域名（可选）

在 Cloudflare Dashboard → Workers & Pages → 你的项目 → Custom Domains 中添加域名。

## 注意事项

- Cloudflare Pages Functions 免费计划每天 100,000 次请求
- D1 数据库免费计划每天 5 百万行读取，10 万行写入
- 如果需要更多配额，可以升级到付费计划
