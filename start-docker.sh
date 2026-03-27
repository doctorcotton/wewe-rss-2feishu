#!/bin/bash

# 确保脚本可执行
# chmod +x start-docker.sh

# 检查.env文件是否存在，如果不存在则从示例创建
if [ ! -f .env ]; then
    echo "创建.env文件从.env.example..."
    cp .env.example .env
    echo "请编辑.env文件设置您的环境变量"
fi

# 检查python-scripts/.env文件是否存在
if [ ! -f python-scripts/.env ]; then
    echo "创建python-scripts/.env文件从python-scripts/.env.example..."
    cp python-scripts/.env.example python-scripts/.env
    echo "请编辑python-scripts/.env文件设置您的Python服务环境变量"
fi

# 启动Docker容器
echo "启动Docker容器..."
docker-compose -f docker-compose.full.yml up -d --build

echo "容器启动中，请稍候..."
echo "WeWe RSS服务将在 http://localhost:4000 可用"
echo "Python服务将在 http://localhost:5001 可用"
echo "使用 'docker-compose -f docker-compose.full.yml logs -f' 查看日志" 