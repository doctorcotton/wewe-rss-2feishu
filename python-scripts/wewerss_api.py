import os
import sys
import json
import time
import threading
import re
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, unquote
import requests

# 尝试导入dotenv
try:
    from dotenv import load_dotenv
except ImportError:
    print("正在安装python-dotenv...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "python-dotenv"])
    from dotenv import load_dotenv

# 加载.env文件
load_dotenv()

# 导入wewerss_runner.py中的函数
from wewerss_runner import convert_md_to_json, start_webhook_server

# 全局变量
webhook_server_thread = None
node_service_url = os.getenv('NODE_SERVICE_URL', 'http://wewe-rss:4000')

class APIHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        """处理GET请求"""
        parsed_url = urlparse(self.path)
        path = parsed_url.path
        
        # 路由处理
        if path == '/':
            self.send_response(200)
            self.send_header('Content-type', 'text/html; charset=utf-8')
            self.end_headers()
            
            html = """
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>WeWe RSS Python服务</title>
                <style>
                    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
                    h1 { color: #333; }
                    .card { border: 1px solid #ddd; border-radius: 5px; padding: 15px; margin-bottom: 20px; }
                    button { background-color: #4CAF50; color: white; padding: 10px 15px; border: none; border-radius: 4px; cursor: pointer; }
                    button:hover { background-color: #45a049; }
                    textarea { width: 100%; height: 200px; padding: 10px; margin: 10px 0; }
                    .result { background-color: #f8f8f8; padding: 10px; border-radius: 4px; white-space: pre-wrap; }
                </style>
            </head>
            <body>
                <h1>WeWe RSS Python服务</h1>
                
                <div class="card">
                    <h2>1. 启动Webhook服务器</h2>
                    <p>启动一个Webhook服务器，监听来自飞书多维表格的请求</p>
                    <button onclick="startWebhookServer()">启动服务器</button>
                    <div id="webhook-result" class="result"></div>
                </div>
                
                <div class="card">
                    <h2>2. MD转JSON测试</h2>
                    <p>测试将Markdown内容转换为卡片新闻格式</p>
                    <textarea id="md-content" placeholder="请输入Markdown内容..."></textarea>
                    <button onclick="convertMdToJson()">转换</button>
                    <div id="convert-result" class="result"></div>
                </div>
                
                <div class="card">
                    <h2>3. 发送文章到飞书</h2>
                    <p>从WeWe RSS获取文章并发送到飞书</p>
                    <button onclick="sendArticlesToFeishu()">发送文章</button>
                    <div id="send-result" class="result"></div>
                </div>
                
                <div class="card">
                    <h2>4. 发送每日摘要</h2>
                    <p>发送每日摘要到飞书</p>
                    <textarea id="summary-content" placeholder="请输入摘要内容..."></textarea>
                    <button onclick="sendDailySummary()">发送摘要</button>
                    <div id="summary-result" class="result"></div>
                </div>
                
                <script>
                    function startWebhookServer() {
                        fetch('/start-webhook-server')
                            .then(response => response.json())
                            .then(data => {
                                document.getElementById('webhook-result').textContent = JSON.stringify(data, null, 2);
                            })
                            .catch(error => {
                                document.getElementById('webhook-result').textContent = '错误: ' + error;
                            });
                    }
                    
                    function convertMdToJson() {
                        const mdContent = document.getElementById('md-content').value;
                        fetch('/convert-md', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ content: mdContent })
                        })
                        .then(response => response.json())
                        .then(data => {
                            document.getElementById('convert-result').textContent = data.result;
                        })
                        .catch(error => {
                            document.getElementById('convert-result').textContent = '错误: ' + error;
                        });
                    }
                    
                    function sendArticlesToFeishu() {
                        fetch('/send-articles-to-feishu')
                            .then(response => response.json())
                            .then(data => {
                                document.getElementById('send-result').textContent = JSON.stringify(data, null, 2);
                            })
                            .catch(error => {
                                document.getElementById('send-result').textContent = '错误: ' + error;
                            });
                    }
                    
                    function sendDailySummary() {
                        const summaryContent = document.getElementById('summary-content').value;
                        fetch('/send-daily-summary', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ content: summaryContent })
                        })
                        .then(response => response.json())
                        .then(data => {
                            document.getElementById('summary-result').textContent = JSON.stringify(data, null, 2);
                        })
                        .catch(error => {
                            document.getElementById('summary-result').textContent = '错误: ' + error;
                        });
                    }
                </script>
            </body>
            </html>
            """
            
            self.wfile.write(html.encode('utf-8'))
            
        elif path == '/start-webhook-server':
            self.start_webhook_server_handler()
            
        elif path == '/convert':
            # 处理/convert路径，与wewerss_runner.py中的相同
            self.handle_convert_request()
            
        elif path == '/send-articles-to-feishu':
            # 调用Node.js服务发送文章到飞书
            self.send_articles_to_feishu()
            
        else:
            self.send_response(404)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                "error": "未找到指定接口",
                "help": "可用接口: /, /start-webhook-server, /convert, /convert-md, /send-articles-to-feishu, /send-daily-summary"
            }).encode('utf-8'))
    
    def do_POST(self):
        """处理POST请求"""
        parsed_url = urlparse(self.path)
        path = parsed_url.path
        
        if path == '/convert-md':
            # 获取请求体中的markdown内容
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length) if content_length > 0 else None
            
            if post_data:
                try:
                    request_data = json.loads(post_data.decode('utf-8'))
                    md_content = request_data.get('content', '')
                    
                    if md_content:
                        # 转换为JSON
                        result = convert_md_to_json(md_content)
                        
                        # 发送响应
                        self.send_response(200)
                        self.send_header('Content-type', 'application/json')
                        self.end_headers()
                        self.wfile.write(json.dumps({
                            "success": True,
                            "result": result
                        }).encode('utf-8'))
                    else:
                        self.send_response(400)
                        self.send_header('Content-type', 'application/json')
                        self.end_headers()
                        self.wfile.write(json.dumps({
                            "error": "未提供Markdown内容"
                        }).encode('utf-8'))
                except Exception as e:
                    self.send_response(500)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        "error": str(e)
                    }).encode('utf-8'))
            else:
                self.send_response(400)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    "error": "请求体为空"
                }).encode('utf-8'))
        elif path == '/convert':
            # 处理/convert路径，与wewerss_runner.py中的相同
            self.handle_convert_request()
        elif path == '/send-daily-summary':
            # 发送每日摘要到飞书
            self.send_daily_summary()
        else:
            self.send_response(404)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                "error": "未找到指定接口"
            }).encode('utf-8'))
    
    def start_webhook_server_handler(self):
        """启动Webhook服务器的处理函数"""
        global webhook_server_thread
        
        # 检查是否已经启动
        if webhook_server_thread and webhook_server_thread.is_alive():
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                "status": "already_running",
                "message": "Webhook服务器已经在运行中"
            }).encode('utf-8'))
            return
        
        # 启动Webhook服务器
        try:
            webhook_server_thread = threading.Thread(target=start_webhook_server, daemon=True)
            webhook_server_thread.start()
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                "status": "started",
                "message": "Webhook服务器已启动在 http://localhost:4000"
            }).encode('utf-8'))
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                "status": "error",
                "message": f"启动Webhook服务器时出错: {str(e)}"
            }).encode('utf-8'))
    
    def handle_convert_request(self):
        """处理/convert请求，与wewerss_runner.py中的相同"""
        try:
            # 解析URL和参数
            parsed_url = urlparse(self.path)
            
            # 获取请求体中的markdown内容
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length) if content_length > 0 else None
            
            # 尝试多种方式获取markdown内容
            md_content = None
            
            # 1. 首先尝试从URL参数中获取
            params = parse_qs(parsed_url.query)
            if 'markdown' in params:
                md_content = unquote(params['markdown'][0])
                print('从URL参数markdown获取到内容')
            elif 'content' in params:
                md_content = unquote(params['content'][0])
                print('从URL参数content获取到内容')
            
            # 2. 如果URL参数中没有，尝试从请求体获取
            if not md_content and post_data:
                try:
                    # 尝试解析JSON
                    request_data = json.loads(post_data.decode('utf-8'))
                    # 依次尝试不同的键名
                    for key in ['markdown', 'content', 'text']:
                        if key in request_data:
                            md_content = request_data[key]
                            print(f'从请求体{key}字段获取到内容')
                            break
                except json.JSONDecodeError:
                    # 如果不是JSON，直接使用请求体内容
                    md_content = post_data.decode('utf-8')
                    print('使用原始请求体内容')
            
            if md_content:
                # 转换为JSON
                response_json = convert_md_to_json(md_content)
                
                # 发送响应
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps(response_json, ensure_ascii=False).encode('utf-8'))
            else:
                # 如果没有内容，返回错误
                error_msg = {
                    "error": "未找到markdown内容",
                    "help": "请使用以下方式之一提供markdown内容：\n1. URL参数：?markdown=内容 或 ?content=内容\n2. POST请求体：{\"markdown\": \"内容\"} 或 {\"content\": \"内容\"}"
                }
                self.send_response(400)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(error_msg, ensure_ascii=False).encode('utf-8'))
        except Exception as e:
            # 发生错误时返回500
            error_msg = {
                "error": str(e),
                "type": type(e).__name__
            }
            print(f'处理请求时出错: {str(e)}')
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(error_msg, ensure_ascii=False).encode('utf-8'))
    
    def send_articles_to_feishu(self):
        """从WeWe RSS获取文章并发送到飞书"""
        try:
            # 调用Node.js服务的API
            api_url = f"{node_service_url}/api/python/send-articles"
            
            # 发送请求
            response = requests.post(api_url, json={
                "auth_code": os.getenv('AUTH_CODE', 'wewerss123')
            })
            
            # 检查响应
            if response.status_code == 200:
                result = response.json()
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    "success": True,
                    "message": "成功发送文章到飞书",
                    "result": result
                }).encode('utf-8'))
            else:
                self.send_response(response.status_code)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    "success": False,
                    "message": f"发送文章失败: {response.text}"
                }).encode('utf-8'))
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                "success": False,
                "message": f"发送文章失败: {str(e)}"
            }).encode('utf-8'))
    
    def send_daily_summary(self):
        """发送每日摘要到飞书"""
        try:
            # 获取请求体中的摘要内容
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length) if content_length > 0 else None
            
            if post_data:
                try:
                    request_data = json.loads(post_data.decode('utf-8'))
                    summary_content = request_data.get('content', '')
                    
                    if summary_content:
                        # 调用Node.js服务的API
                        api_url = f"{node_service_url}/api/python/send-summary"
                        
                        # 发送请求
                        response = requests.post(api_url, json={
                            "auth_code": os.getenv('AUTH_CODE', 'wewerss123'),
                            "summary": summary_content
                        })
                        
                        # 检查响应
                        if response.status_code == 200:
                            result = response.json()
                            
                            self.send_response(200)
                            self.send_header('Content-type', 'application/json')
                            self.end_headers()
                            self.wfile.write(json.dumps({
                                "success": True,
                                "message": "成功发送每日摘要到飞书",
                                "result": result
                            }).encode('utf-8'))
                        else:
                            self.send_response(response.status_code)
                            self.send_header('Content-type', 'application/json')
                            self.end_headers()
                            self.wfile.write(json.dumps({
                                "success": False,
                                "message": f"发送每日摘要失败: {response.text}"
                            }).encode('utf-8'))
                    else:
                        self.send_response(400)
                        self.send_header('Content-type', 'application/json')
                        self.end_headers()
                        self.wfile.write(json.dumps({
                            "error": "未提供摘要内容"
                        }).encode('utf-8'))
                except Exception as e:
                    self.send_response(500)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        "error": str(e)
                    }).encode('utf-8'))
            else:
                self.send_response(400)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    "error": "请求体为空"
                }).encode('utf-8'))
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                "success": False,
                "message": f"发送每日摘要失败: {str(e)}"
            }).encode('utf-8'))
    
    def do_OPTIONS(self):
        """处理OPTIONS请求，支持CORS"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

def run_api_server(port=5001):
    """运行API服务器"""
    server = HTTPServer(('0.0.0.0', port), APIHandler)
    print(f"API服务器已启动在 http://0.0.0.0:{port}")
    server.serve_forever()

if __name__ == "__main__":
    # 运行API服务器
    run_api_server() 