@echo off
echo 正在复制src目录下的文件...

rem 创建src目录
mkdir src 2>nul

rem 复制src目录下的文件
xcopy /E /Y ..\src\*.* src\

rem 创建data目录
mkdir data 2>nul

rem 复制data目录下的文件
echo 正在复制data目录下的文件...
if exist ..\data (
  xcopy /E /Y ..\data\*.* data\
) else (
  echo data目录不存在，将创建空目录
)

echo 复制完成！
pause 