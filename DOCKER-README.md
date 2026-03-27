# WeWe RSS Docker 部署指南

本文档提供了使用 Docker 部署 WeWe RSS 项目的完整指南。

## 前提条件

- 安装 [Docker](https://www.docker.com/get-started)
- 安装 [Docker Compose](https://docs.docker.com/compose/install/)

## 快速开始

### Windows 用户

1. 双击运行 `start-docker.bat` 文件
2. 脚本会自动检查环境文件，并启动所有必要的 Docker 容器

### Linux/Mac 用户

1. 确保 `start-docker.sh` 文件有执行权限：
   ```bash
   chmod +x start-docker.sh
   ```

2. 运行脚本：
   ```bash
   ./start-docker.sh
   ```

## 手动部署步骤

如果您想手动部署，请按照以下步骤操作：

1. 确保环境文件存在：
   - 如果 `.env` 文件不存在，请从 `.env.example` 复制并修改
   - 如果 `python-scripts/.env` 文件不存在，请从 `python-scripts/.env.example` 复制并修改

2. 使用 Docker Compose 启动所有服务：
   ```bash
   docker-compose -f docker-compose.full.yml up -d --build
   ```

3. 查看日志：
   ```bash
   docker-compose -f docker-compose.full.yml logs -f
   ```

## 服务访问

- WeWe RSS 主服务: http://localhost:4000
- Python 服务: http://localhost:5001

## 环境变量配置

### 主服务环境变量 (.env)

- `MYSQL_ROOT_PASSWORD`: MySQL 数据库密码
- `AUTH_CODE`: API 授权码
- `FEED_MODE`: 订阅源模式 (默认: fulltext)
- `CRON_EXPRESSION`: 定时更新表达式 (默认: 35 5,17 * * *)
- `MAX_REQUEST_PER_MINUTE`: 每分钟最大请求数 (默认: 60)
- `SERVER_ORIGIN_URL`: 服务器外部访问地址 (默认: http://localhost:4000)

### Python 服务环境变量 (python-scripts/.env)

- `FEISHU_SUMMARY_WEBHOOK_URL`: 飞书摘要 Webhook URL
- `FEISHU_MD_TO_JSON_WEBHOOK_URL`: 飞书 Markdown 转 JSON Webhook URL
- `FEISHU_TABLE_SCHEDULE_TIME`: 飞书表格定时任务时间 (默认: 0 30 9 * * *)
- `ARTICLE_INTERVAL_MINUTES`: 文章间隔分钟数 (默认: 0.2)
- `SUMMARY_DELAY_MINUTES`: 摘要延迟分钟数 (默认: 2)

## 停止服务

```bash
docker-compose -f docker-compose.full.yml down
```

## 数据持久化

所有数据存储在 Docker 卷中，即使容器被删除，数据也会保留。

- 数据库数据: Docker 卷 `db_data`
- 应用数据: 挂载到容器的 `./data` 目录

## 故障排除

1. 如果服务无法启动，请检查日志：
   ```bash
   docker-compose -f docker-compose.full.yml logs -f
   ```

2. 如果需要重置数据库，可以删除卷：
   ```bash
   docker-compose -f docker-compose.full.yml down -v
   ```

3. 如果需要重新构建镜像：
   ```bash
   docker-compose -f docker-compose.full.yml build --no-cache
   ``` 