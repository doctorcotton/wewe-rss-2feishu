# WeWe RSS Python服务

这个服务提供了将Markdown内容转换为飞书卡片新闻格式的功能，以及处理飞书多维表格的Webhook请求。

## 功能

1. **MD转JSON服务**：将Markdown内容转换为飞书卡片新闻格式
2. **Webhook服务器**：处理来自飞书多维表格的Webhook请求

## 使用方法

### 通过Docker Compose运行

1. 复制`.env.example`文件为`.env`，并填写相关配置：

```bash
cp .env.example .env
```

2. 编辑`.env`文件，填写飞书Webhook URL等配置

3. 使用Docker Compose启动服务：

```bash
docker-compose -f docker-compose.full.yml up -d
```

### 访问服务

- WeWe RSS服务：http://localhost:4000
- Python API服务：http://localhost:5001

## API接口

### 1. 启动Webhook服务器

```
GET /start-webhook-server
```

启动一个Webhook服务器，监听来自飞书多维表格的请求。

### 2. MD转JSON

```
POST /convert-md
Content-Type: application/json

{
  "content": "# 标题\n\n## 1. 今日要点速览\n\n- 内容1\n- 内容2"
}
```

将Markdown内容转换为飞书卡片新闻格式。

### 3. 处理Webhook请求

```
POST /convert
Content-Type: application/json

{
  "content": "# 标题\n\n## 1. 今日要点速览\n\n- 内容1\n- 内容2"
}
```

处理来自飞书多维表格的Webhook请求，将Markdown内容转换为卡片新闻格式。

## 配置项

| 环境变量 | 说明 | 默认值 |
| --- | --- | --- |
| FEISHU_SUMMARY_WEBHOOK_URL | 飞书总结Webhook URL | - |
| FEISHU_MD_TO_JSON_WEBHOOK_URL | 飞书MD转JSON Webhook URL | - |
| FEISHU_TABLE_SCHEDULE_TIME | 定时任务时间 | 0 30 9 * * * |
| ARTICLE_INTERVAL_MINUTES | 文章发送间隔（分钟） | 0.2 |
| SUMMARY_DELAY_MINUTES | 总结延迟时间（分钟） | 2 |
| WEWE_RSS_URL | WeWe RSS服务URL | http://wewe-rss:4000 |
| AUTH_CODE | 认证码 | wewerss123 | 