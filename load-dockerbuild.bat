@echo off
chcp 65001 >nul
echo 正在加载Docker构建环境变量...

REM 检查.dockerbuild文件是否存在
if not exist .dockerbuild (
    echo 错误：.dockerbuild文件不存在！
    echo 请确保.dockerbuild文件在当前目录中。
    pause
    exit /b 1
)

echo 从.dockerbuild文件加载环境变量...

REM 读取并设置环境变量
for /f "tokens=1,* delims==" %%a in (.dockerbuild) do (
    if not "%%a"=="" (
        if not "%%a:~0,1"=="#" (
            echo 设置: %%a=%%b
            setx %%a %%b
            set %%a=%%b
        )
    )
)

echo.
echo Docker构建环境变量已加载！
echo 现在您可以运行start-docker.bat来启动Docker容器。
echo.
echo 注意：某些环境变量可能需要重启命令提示符或PowerShell才能生效。
echo 如果仍然遇到问题，请尝试重启Docker Desktop。

pause 