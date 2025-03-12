#!/bin/bash

# 创建src目录
mkdir -p src

# 复制src目录下的文件
echo "正在复制src目录下的文件..."
cp -r ../src/* ./src/

# 创建data目录
mkdir -p data

# 复制data目录下的文件
echo "正在复制data目录下的文件..."
if [ -d "../data" ]; then
  cp -r ../data/* ./data/
else
  echo "data目录不存在，将创建空目录"
  mkdir -p data
fi

echo "复制完成！" 