@echo off
chcp 65001 >nul
echo Starting WeWe RSS Docker environment...

REM 设置Docker信任不安全注册表（解决证书问题）
echo Setting Docker to trust insecure registries (to fix certificate issues)...
set DOCKER_CLI_EXPERIMENTAL=enabled
set COMPOSE_DOCKER_CLI_BUILD=1
set DOCKER_BUILDKIT=1

REM Check if .env file exists, if not create it from example
if not exist .env (
    echo Creating .env file from .env.example...
    copy .env.example .env
    echo Please edit the .env file to set your environment variables
)

REM Check if python-scripts/.env file exists
if not exist python-scripts\.env (
    echo Creating python-scripts/.env file from python-scripts/.env.example...
    copy python-scripts\.env.example python-scripts\.env
    echo Please edit the python-scripts/.env file to set your Python service environment variables
)

REM Start Docker containers
echo Starting Docker containers...
echo Note: If you encounter certificate errors, you may need to:
echo 1. Check your network connection or proxy settings
echo 2. Run 'docker login' separately before running this script
echo 3. Configure Docker to use a different registry mirror

docker-compose -f docker-compose.full.yml up -d --build

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Error: Docker containers failed to start properly.
    echo Possible solutions:
    echo 1. Check your internet connection
    echo 2. Run 'docker login' manually
    echo 3. Add Docker registry mirrors in Docker Desktop settings
    echo 4. Temporarily disable SSL verification in Docker (not recommended for production)
    echo.
) else (
    echo Containers are starting, please wait...
    echo WeWe RSS service will be available at http://localhost:4000
    echo Python service will be available at http://localhost:5001
    echo Use 'docker-compose -f docker-compose.full.yml logs -f' to view logs
)

pause 