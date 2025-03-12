import os
import sys
import subprocess
import time
import json
import tempfile
import random
import datetime
import shutil
from pathlib import Path
import re
from http.server import HTTPServer, BaseHTTPRequestHandler
import threading
import markdown
from urllib.parse import urlparse, parse_qs, unquote
import requests

# 添加dotenv支持，用于读取.env文件
try:
    from dotenv import load_dotenv
except ImportError:
    print("正在安装python-dotenv...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "python-dotenv"])
    from dotenv import load_dotenv

def convert_md_to_json(md_content):
    """将Markdown内容转换为卡片新闻格式"""
    try:
        # 清理不可见字符
        md_content = re.sub(r'[\u200b-\u200f\u2028-\u202f\ufeff]', '', md_content)
        
        # 提取标题（如果有）并移除
        title = ""
        md_lines = md_content.split('\n')
        if md_lines and md_lines[0].startswith('# '):
            title = md_lines[0].strip('# ').strip()  # 提取标题但不使用
            md_lines = md_lines[1:]  # 移除标题行
        
        # 初始化结果内容
        result_lines = []
        
        # 处理内容
        current_section = None
        skip_next_line = False
        
        for i, line in enumerate(md_lines):
            # 跳过被标记的行
            if skip_next_line:
                skip_next_line = False
                continue
                
            # 清理每行的不可见字符和多余空格
            line = re.sub(r'[\u200b-\u200f\u2028-\u202f\ufeff]', '', line.rstrip())
            
            # 跳过分隔线
            if line.strip() == '---':
                continue
                
            # 处理一级标题（## 1. 今日要点速览 -> :Loudspeaker:**今日要点速览**）
            if line.startswith('## '):
                section_title = line.strip('## ').strip()
                # 提取数字和点（如果有）
                section_title = re.sub(r'^\d+\.\s*', '', section_title)
                
                # 根据不同的标题添加不同的表情
                emoji = ""
                if "要点速览" in section_title:
                    emoji = ":Loudspeaker:"
                elif "分类详情" in section_title:
                    emoji = ":Pin:"
                elif "研发启示" in section_title:
                    emoji = ":StatusFlashOfInspiration:"
                elif "脑暴主题" in section_title:
                    emoji = ":FIREWORKS:"
                
                result_lines.append(f"{emoji}**{section_title}** ")
                current_section = section_title
                
            # 处理二级标题（### 2.1 香气与感官体验 -> **香气与感官体验**）
            elif line.startswith('### '):
                section_title = line.strip('### ').strip()
                # 提取数字和点（如果有）
                section_title = re.sub(r'^\d+\.\d+\s*', '', section_title)
                result_lines.append(f"**{section_title}**")
                
            # 处理三级标题（**突破性研究**： -> - **突破性研究**）
            elif line.strip().startswith('**') and line.strip().endswith('**：'):
                # 移除冒号
                line = line.strip().rstrip('：')
                result_lines.append(f"- {line}")
                
            # 处理列表项
            elif line.strip().startswith('- '):
                # 在"今日要点速览"部分，为重要项添加红色标记
                if current_section and "要点速览" in current_section:
                    if "（相关度4）" in line:
                        # 移除相关度标记
                        line = line.replace("（相关度4）", "")
                        result_lines.append(f"<font color='red'>重要发现</font>")
                        result_lines.append(line)
                    else:
                        # 移除相关度标记
                        line = re.sub(r'（相关度\d+）', '', line)
                        result_lines.append(line)
                else:
                    result_lines.append(line)
                    
            # 处理链接和内容
            elif '[' in line and '](' in line:
                result_lines.append(line)
                
            # 处理普通段落
            elif line.strip():
                result_lines.append(line)
                
            # 处理空行
            elif line.strip() == '':
                # 避免连续的空行
                if result_lines and result_lines[-1] != ' <br />':
                    result_lines.append(' <br />')
        
        # 处理最后一部分（添加讨论链接）
        result_lines.append("---")
        result_lines.append("")
        result_lines.append("<link icon='chat_outlined' url='https://applink.feishu.cn/client/chat/chatter/add_by_link?link_token=703ib104-9026-4fcd-a5bc-2752f0730d81'>参与讨论</link>")
        
        # 合并结果
        result_content = '\n'.join(result_lines)
        
        return result_content
    except Exception as e:
        print(f'转换Markdown到卡片新闻格式时出错: {str(e)}')
        return f"转换失败: {str(e)}"

def process_markdown_content(content):
    """处理Markdown内容，确保标题层级规范"""
    lines = content.split('\n')
    processed_lines = []
    
    for i, line in enumerate(lines):
        # 处理标题后直接跟着加粗内容的情况
        if line.startswith('###') and i + 1 < len(lines) and lines[i+1].startswith('**'):
            # 将标题和加粗内容分开
            processed_lines.append(line)
            processed_lines.append('')  # 添加空行
        else:
            processed_lines.append(line)
    
    return '\n'.join(processed_lines)

def send_webhook_to_feishu(summary_webhook_url):
    """发送webhook到飞书，包含本地服务器地址"""
    try:
        # 构建webhook数据
        webhook_data = {
            "msg_type": "text",
            "content": {
                "text": "http://localhost:4000/convert"
            }
        }
        
        # 发送webhook
        response = requests.post(
            summary_webhook_url, 
            json=webhook_data,
            headers={
                "Content-Type": "application/json"
            }
        )
        print(f"已发送webhook到飞书，状态码: {response.status_code}")
        
        if response.status_code != 200:
            print(f"发送webhook失败: {response.text}")
            
    except Exception as e:
        print(f"发送webhook时出错: {e}")

class MDToJSONHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        self._handle_request()
        
    def do_GET(self):
        self._handle_request()
    
    def _handle_request(self):
        try:
            # 解析URL和参数
            parsed_url = urlparse(self.path)
            
            # 如果路径是/convert
            if parsed_url.path == '/convert':
                # 获取请求体中的markdown内容
                content_length = int(self.headers.get('Content-Length', 0))
                post_data = self.rfile.read(content_length) if content_length > 0 else None
                
                # 尝试多种方式获取markdown内容
                md_content = None
                
                # 1. 首先尝试从URL参数中获取
                params = parse_qs(parsed_url.query)
                if 'markdown' in params:
                    md_content = unquote(params['markdown'][0])
                    logger.info('从URL参数markdown获取到内容')
                elif 'content' in params:
                    md_content = unquote(params['content'][0])
                    logger.info('从URL参数content获取到内容')
                
                # 2. 如果URL参数中没有，尝试从请求体获取
                if not md_content and post_data:
                    try:
                        # 尝试解析JSON
                        request_data = json.loads(post_data.decode('utf-8'))
                        # 依次尝试不同的键名
                        for key in ['markdown', 'content', 'text']:
                            if key in request_data:
                                md_content = request_data[key]
                                logger.info(f'从请求体{key}字段获取到内容')
                                break
                    except json.JSONDecodeError:
                        # 如果不是JSON，直接使用请求体内容
                        md_content = post_data.decode('utf-8')
                        logger.info('使用原始请求体内容')
                
                if md_content:
                    # 记录接收到的MD内容
                    logger.logMdJson('MD_RECEIVED', '接收到Markdown内容', md_content)
                    
                    # 转换为JSON
                    response_json = convert_md_to_json(md_content)
                    
                    # 记录发送的JSON内容
                    logger.logMdJson('JSON_SENT', '转换后的JSON内容', response_json)
                    
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
            else:
                # 返回404
                self.send_response(404)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    "error": "未找到指定接口",
                    "help": "请使用 /convert 接口"
                }).encode('utf-8'))
                
        except Exception as e:
            # 发生错误时返回500
            error_msg = {
                "error": str(e),
                "type": type(e).__name__
            }
            logger.error(f'处理请求时出错: {str(e)}', exc_info=True)
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(error_msg, ensure_ascii=False).encode('utf-8'))
    
    def do_OPTIONS(self):
        # 处理CORS预检请求
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

def start_webhook_server():
    """启动Webhook服务器"""
    server = HTTPServer(('localhost', 4000), MDToJSONHandler)
    print("Webhook服务器已启动在 http://localhost:4000")
    print("等待飞书多维表格的回调请求...")
    server.serve_forever()

def main():
    """
    微信公众号文章处理与飞书多维表格推送系统
    """
    # 获取当前脚本所在目录
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    # 加载.env文件
    env_path = os.path.join(script_dir, ".env")
    if os.path.exists(env_path):
        load_dotenv(env_path)
        print("已加载.env文件配置")
    else:
        print("警告: 未找到.env文件，将使用默认配置")
    
    print("===================================================")
    print("      微信公众号文章处理与飞书多维表格推送系统")
    print("===================================================")
    print()
    
    # 运行模式选择
    print("请选择运行模式:")
    print("1. 定时发送模式 (每日9点30分发送)")
    print("2. 测试模式 (立即搜集24小时内文章, 每0.2分钟发送一条)")
    print("3. 测试Webhook格式模式")
    print("4. 快速测试模式 (仅发送3篇文章后等待1分钟再生成总结)")
    print("5. 启动MD转JSON服务 (等待多维表格回调)")
    print("6. 测试MD转卡片新闻格式 (手动输入测试)")
    print()
    
    mode_choice = input("请输入选项 (1-6): ")
    
    # 启动Webhook服务器（仅在需要时启动）
    if mode_choice in ["1", "2", "5"]:
        webhook_thread = threading.Thread(target=start_webhook_server, daemon=True)
        webhook_thread.start()
        print("Webhook服务器已启动在 http://localhost:4000")
        print("等待飞书多维表格的回调请求...")
    
    if mode_choice == "5":
        # 仅启动服务等待回调
        print("\n服务已启动，等待多维表格发送Markdown内容...")
        print("按Ctrl+C终止服务")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\n服务已停止")
            return
    elif mode_choice == "6":
        # 手动测试MD转卡片新闻格式功能
        print("\n测试MD转卡片新闻格式功能")
        print("-------------------")
        print("1. 手动输入Markdown内容")
        print("2. 使用示例文件 (inputexam.md)")
        print()
        
        test_choice = input("请选择测试方式 (1-2): ")
        
        md_content = None
        if test_choice == "1":
            print("\n请输入Markdown内容 (输入空行两次结束):")
            md_lines = []
            empty_line_count = 0
            
            while empty_line_count < 2:
                line = input()
                if not line:
                    empty_line_count += 1
                else:
                    empty_line_count = 0
                    md_lines.append(line)
            
            if md_lines:
                md_content = '\n'.join(md_lines)
        elif test_choice == "2":
            # 读取示例文件
            example_file = os.path.join(script_dir, "inputexam.md")
            if os.path.exists(example_file):
                try:
                    with open(example_file, 'r', encoding='utf-8') as f:
                        md_content = f.read()
                    print(f"\n已读取示例文件: {example_file}")
                except Exception as e:
                    print(f"\n读取示例文件失败: {e}")
                    return
            else:
                print(f"\n错误: 示例文件不存在: {example_file}")
                return
        else:
            print("\n无效选项")
            return
        
        if not md_content:
            print("\n错误: 未获取到任何内容")
            return
        
        print("\n转换结果:")
        print("---------")
        result = convert_md_to_json(md_content)
        print(result)
        
        # 保存结果到文件
        output_file = os.path.join(script_dir, "checkoutput.md")
        try:
            with open(output_file, 'w', encoding='utf-8') as f:
                f.write(result)
            print(f"\n转换结果已保存到: {output_file}")
        except Exception as e:
            print(f"\n保存结果失败: {e}")
        
        print("\n测试完成，按任意键返回...")
        input()
        return
    
    # 获取飞书webhook URL
    summary_webhook_url = os.getenv('FEISHU_SUMMARY_WEBHOOK_URL')
    md_to_json_webhook_url = os.getenv('FEISHU_MD_TO_JSON_WEBHOOK_URL')
    
    if not summary_webhook_url:
        print("错误: 未配置FEISHU_SUMMARY_WEBHOOK_URL")
        return
    
    if not md_to_json_webhook_url:
        print("错误: 未配置FEISHU_MD_TO_JSON_WEBHOOK_URL")
        return
    
    # 发送webhook到飞书
    # 在总结webhook后延迟3分钟发送MD转JSON的webhook
    def delayed_send_md_to_json_webhook():
        time.sleep(180)  # 延迟3分钟
        send_webhook_to_feishu(md_to_json_webhook_url)
    
    # 在新线程中启动延迟发送
    if mode_choice in ["1", "2"]:  # 只在模式1和2中启用延迟发送
        threading.Thread(target=delayed_send_md_to_json_webhook, daemon=True).start()
    
    # 检查是否有正在运行的相关Node.js进程
    print("正在检查是否有后台运行的处理进程..")
    
    # 创建一个PID文件来存储当前进程的PID
    pid_file = os.path.join(script_dir, "wewerss_pid.txt")
    
    # 检查PID文件是否存在
    if os.path.exists(pid_file):
        print("发现PID文件, 检查之前的进程是否仍在运行..")
        
        with open(pid_file, 'r') as f:
            prev_pid = f.read().strip()
        
        # 检查进程是否仍在运行
        try:
            # Windows系统使用tasklist命令
            result = subprocess.run(f'tasklist /fi "PID eq {prev_pid}" /fo csv', 
                                   shell=True, capture_output=True, text=True)
            if prev_pid in result.stdout:
                print(f"发现之前启动的微信公众号处理程序进程 (PID: {prev_pid})")
                print()
                print("请选择操作:")
                print("1. 终止该进程后继续")
                print("2. 保留现有进程并继续")
                print()
                
                kill_choice = input("请输入选项 (1-2): ")
                
                if kill_choice == "1":
                    print(f"正在终止进程 (PID: {prev_pid})..")
                    try:
                        subprocess.run(f'taskkill /f /pid {prev_pid}', shell=True, 
                                      capture_output=True, check=True)
                        print("进程已成功终止")
                    except subprocess.CalledProcessError:
                        print("警告: 无法终止进程, 可能已经结束")
                else:
                    print("保留现有进程并继续")
                    print("注意: 多个实例同时运行可能会导致重复发送消息")
            else:
                print("之前的进程已不再运行, 将创建新的PID文件")
                try:
                    os.remove(pid_file)
                except:
                    pass
        except Exception as e:
            print(f"检查进程时出错: {e}")
        
        print()
    
    # 根据选择的模式执行相应的操作
    if mode_choice == "5":
        test_md_to_json_conversion()
    elif mode_choice in ["1", "2", "3", "4"]:
        # 设置默认值
        env_vars = {
            "PUSH_TO_FEISHU": "true",
            "PUSH_TO_KOOZHI": "false",
            "ARTICLE_INTERVAL_MINUTES": os.getenv("ARTICLE_INTERVAL_MINUTES", "0.2"),
            "GENERATE_DAILY_SUMMARY": "true",
            "SEND_MODE": "schedule",
            "USE_LOCAL_AI": "false",
            "AI_PROVIDER": "none",
            "FEISHU_TABLE_SKIP_AI": "true",
            "SAVE_TO_DAILY_MD": "false",
            "SUMMARY_DELAY_MINUTES": os.getenv("SUMMARY_DELAY_MINUTES", "2")
        }
        
        # 从.env文件中读取FEISHU_TABLE_SCHEDULE_TIME
        feishu_table_schedule_time = os.getenv("FEISHU_TABLE_SCHEDULE_TIME", "0 30 9 * * *")
        # 设置SCHEDULE_TIME为FEISHU_TABLE_SCHEDULE_TIME
        env_vars["SCHEDULE_TIME"] = feishu_table_schedule_time
        
        if mode_choice == "1":
            # 定时发送模式
            env_vars["SEND_MODE"] = "schedule"
            env_vars["FEISHU_TABLE_TEST_MODE"] = "false"
            env_vars["QUICK_TEST_MODE"] = "false"
            print()
            print(f"已设置为定时发送模式, 将在每天{feishu_table_schedule_time.split(' ')[2]}点{feishu_table_schedule_time.split(' ')[1]}分开始发送文章")
        elif mode_choice == "2":
            # 测试模式
            env_vars["SEND_MODE"] = "schedule"
            env_vars["FEISHU_TABLE_TEST_MODE"] = "true"
            env_vars["QUICK_TEST_MODE"] = "false"
            print()
            print(f"已设置为测试模式, 将立即搜集24小时内文章并每{env_vars['ARTICLE_INTERVAL_MINUTES']}分钟发送一条")
        elif mode_choice == "3":
            # 测试Webhook格式模式
            test_webhook()
            return
        elif mode_choice == "4":
            # 快速测试模式
            env_vars["SEND_MODE"] = "schedule"
            env_vars["FEISHU_TABLE_TEST_MODE"] = "true"
            env_vars["QUICK_TEST_MODE"] = "true"
            env_vars["QUICK_TEST_ARTICLE_COUNT"] = "3"
            print()
            print("已设置为快速测试模式, 将仅发送3篇文章后等待1分钟再生成总结")
        
        start_program(script_dir, env_vars, mode_choice)
    else:
        print("无效选项, 请重新运行程序并选择正确的选项")
        input("按任意键退出...")
        return

def test_md_to_json_conversion():
    """测试MD转JSON功能"""
    print()
    print("测试MD转JSON功能")
    print("----------------")
    
    # 获取webhook URL
    webhook_url = input("请输入要使用的MD转JSON Webhook URL (直接回车使用.env中的配置): ")
    if not webhook_url:
        webhook_url = os.getenv('FEISHU_MD_TO_JSON_WEBHOOK_URL')
        if not webhook_url:
            print("错误: 未提供webhook URL且环境变量中未配置FEISHU_MD_TO_JSON_WEBHOOK_URL")
            return
    
    print("\n请输入要测试的Markdown内容 (输入空行结束):")
    md_lines = []
    while True:
        line = input()
        if not line:
            break
        md_lines.append(line)
    
    md_content = "\n".join(md_lines)
    if not md_content:
        print("错误: 未输入任何内容")
        return
    
    print("\n正在发送Markdown内容到转换服务...")
    
    try:
        # 发送POST请求
        response = requests.post(
            webhook_url,
            json={"content": md_content},
            headers={"Content-Type": "application/json"}
        )
        
        print(f"\n响应状态码: {response.status_code}")
        if response.status_code == 200:
            print("\n转换结果:")
            print("----------")
            print(json.dumps(response.json(), ensure_ascii=False, indent=2))
        else:
            print(f"转换失败: {response.text}")
    except Exception as e:
        print(f"发送请求时出错: {e}")
    
    print("\n测试完成，按任意键返回...")
    input()

def test_md_to_cardnews_conversion():
    """测试MD转卡片新闻格式功能"""
    print()
    print("测试MD转卡片新闻格式功能")
    print("----------------------")
    
    # 询问是否从文件读取
    use_file = input("是否从文件读取Markdown内容? (y/n): ").lower() == 'y'
    
    if use_file:
        file_path = input("请输入Markdown文件路径: ")
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                md_content = f.read()
        except Exception as e:
            print(f"读取文件时出错: {e}")
            return
    else:
        print("\n请输入要测试的Markdown内容 (输入空行结束):")
        md_lines = []
        while True:
            line = input()
            if not line:
                break
            md_lines.append(line)
        
        md_content = "\n".join(md_lines)
    
    if not md_content:
        print("错误: 未输入任何内容")
        return
    
    print("\n正在转换Markdown内容到卡片新闻格式...")
    
    try:
        # 直接调用转换函数
        result = convert_md_to_json(md_content)
        
        print("\n转换结果:")
        print("----------")
        print(result)
        
        # 询问是否保存到文件
        save_to_file = input("\n是否保存结果到文件? (y/n): ").lower() == 'y'
        if save_to_file:
            output_path = input("请输入输出文件路径: ")
            try:
                with open(output_path, 'w', encoding='utf-8') as f:
                    f.write(result)
                print(f"结果已保存到: {output_path}")
            except Exception as e:
                print(f"保存文件时出错: {e}")
    except Exception as e:
        print(f"转换时出错: {e}")
    
    print("\n测试完成，按任意键返回...")
    input()

def start_program(script_dir, env_vars, mode_choice):
    """启动主程序"""
    print()
    print("正在启动微信公众号内容处理程序..")
    print("运行模式:")
    print("- 推送到飞书多维表格")
    
    if mode_choice == "1":
        print("  发送方式: 定时发送 (每日定时发送)")
        # 确保定时任务时间正确设置
        schedule_time = env_vars.get("SCHEDULE_TIME", "0 30 9 * * *")
        # 将schedule_time设置到env_vars中
        env_vars["SCHEDULE_TIME"] = schedule_time
        print(f"  定时任务时间: {schedule_time}")
        # 确保时间格式正确
        time_parts = schedule_time.split(" ")
        if len(time_parts) >= 3:
            print(f"  将在每天{time_parts[2]}点{time_parts[1]}分开始发送文章")
    elif mode_choice == "4":
        print("  发送方式: 快速测试模式 (仅发送3篇文章后等待1分钟再生成总结)")
    else:
        print("  发送方式: 测试模式 (立即搜集24小时内文章, 每0.2分钟发送一条)")
    
    print(f"  发送间隔: {env_vars['ARTICLE_INTERVAL_MINUTES']}分钟")
    print("  发送完成后通知开始每日总结: 是")
    
    print()
    print("正在处理, 请稍候..")
    print()
    
    # 设置环境变量
    env_vars["NODE_ENV"] = "production"
    
    # 创建临时日志文件
    temp_dir = tempfile.gettempdir()
    temp_log = os.path.join(temp_dir, f"wewerss_log_{random.randint(1000, 9999)}.txt")
    
    # 设置错误处理
    error_occurred = False
    
    # 使用node命令而不是硬编码的路径
    node_path = "node"
    
    # 检查index.js文件是否存在
    index_js = os.path.join(script_dir, "src", "index.js")
    if not os.path.exists(index_js):
        print(f"错误: 找不到文件 {index_js}")
        print("请确保src目录下存在index.js文件")
        input("按Enter键退出...")
        sys.exit(1)
    
    print(f"使用Node.js命令: {node_path}")
    print(f"运行文件: {index_js}")
    
    # 启动程序并实时显示日志
    if env_vars["SEND_MODE"] == "schedule":
        print("正在启动定时发送模式, 程序将在后台运行..")
        print("定时任务已安排, 请勿关闭此窗口, 否则任务将被取消.")
        print()
        
        # 启动Node.js进程
        try:
            index_js = os.path.join(script_dir, "src", "index.js")
            
            # 设置环境变量
            proc_env = os.environ.copy()
            for key, value in env_vars.items():
                proc_env[key] = value
            
            # 打印关键环境变量
            print(f"定时任务时间 (SCHEDULE_TIME): {proc_env.get('SCHEDULE_TIME', '未设置')}")
            print(f"飞书表格定时任务时间 (FEISHU_TABLE_SCHEDULE_TIME): {proc_env.get('FEISHU_TABLE_SCHEDULE_TIME', '未设置')}")
            print(f"发送模式 (SEND_MODE): {proc_env.get('SEND_MODE', '未设置')}")
            print(f"测试模式 (FEISHU_TABLE_TEST_MODE): {proc_env.get('FEISHU_TABLE_TEST_MODE', '未设置')}")
            
            if os.name == 'nt':  # Windows
                # 使用subprocess.Popen在后台运行
                process = subprocess.Popen(
                    f"\"{node_path}\" \"{index_js}\"", 
                    shell=True,
                    stdout=open(temp_log, 'w'),
                    stderr=subprocess.STDOUT,
                    env=proc_env
                )
                
                # 保存PID
                pid_file = os.path.join(script_dir, "wewerss_pid.txt")
                with open(pid_file, 'w') as f:
                    f.write(str(process.pid))
                
                print(f"已启动新进程, PID: {process.pid}")
                
                # 等待一段时间, 确保程序启动
                time.sleep(3)
            else:  # Unix/Linux
                # 使用nohup在后台运行
                subprocess.Popen(
                    f"nohup \"{node_path}\" \"{index_js}\" > \"{temp_log}\" 2>&1 & echo $! > \"{os.path.join(script_dir, 'wewerss_pid.txt')}\"",
                    shell=True,
                    env=proc_env
                )
                
                # 等待一段时间, 确保程序启动
                time.sleep(3)
                
                # 读取PID
                pid_file = os.path.join(script_dir, "wewerss_pid.txt")
                if os.path.exists(pid_file):
                    with open(pid_file, 'r') as f:
                        pid = f.read().strip()
                        print(f"已启动新进程, PID: {pid}")
        except Exception as e:
            print(f"启动进程时出错: {e}")
            error_occurred = True
    else:
        try:
            index_js = os.path.join(script_dir, "src", "index.js")
            
            # 设置环境变量
            proc_env = os.environ.copy()
            for key, value in env_vars.items():
                proc_env[key] = value
            
            # 直接运行并等待完成
            result = subprocess.run(
                f"\"{node_path}\" \"{index_js}\"", 
                shell=True,
                stdout=open(temp_log, 'w'),
                stderr=subprocess.STDOUT,
                env=proc_env
            )
            
            if result.returncode != 0:
                error_occurred = True
        except Exception as e:
            print(f"运行程序时出错: {e}")
            error_occurred = True
    
    # 显示日志内容
    print("处理日志:")
    print("-------------------------------------------")
    try:
        with open(temp_log, 'r', encoding='utf-8') as f:
            print(f.read())
    except:
        try:
            with open(temp_log, 'r') as f:
                print(f.read())
        except Exception as e:
            print(f"读取日志文件时出错: {e}")
    print("-------------------------------------------")
    
    # 检查日志中是否有错误信息
    try:
        with open(temp_log, 'r', encoding='utf-8') as f:
            log_content = f.read()
            if any(error_term in log_content.lower() for error_term in ["error", "exception", "failed"]):
                error_occurred = True
                print()
                print("警告: 日志中发现错误信息, 请检查详细日志.")
    except:
        pass
    
    # 查找并显示最新的日志文件内容
    logs_dir = os.path.join(script_dir, "logs")
    try:
        log_files = sorted(
            [os.path.join(logs_dir, f) for f in os.listdir(logs_dir) if f.endswith('.log')],
            key=os.path.getmtime
        )
        
        if log_files:
            latest_log = log_files[-1]
            print()
            print("详细日志 (最新20条):")
            print("-------------------------------------------")
            
            # 读取最新的20行
            with open(latest_log, 'r', encoding='utf-8') as f:
                lines = f.readlines()
                for line in lines[-20:]:
                    print(line.strip())
            
            print("-------------------------------------------")
            
            # 检查日志文件中是否有错误信息
            with open(latest_log, 'r', encoding='utf-8') as f:
                log_content = f.read()
                if any(error_term in log_content.lower() for error_term in ["error", "exception", "failed"]):
                    error_occurred = True
    except Exception as e:
        print(f"读取日志文件时出错: {e}")
    
    # 删除临时日志文件
    try:
        os.remove(temp_log)
    except:
        pass
    
    if error_occurred:
        print()
        print("警告: 程序执行过程中出现错误, 请检查日志文件.")
        print("可能的原因:")
        print("1. 飞书Webhook URL格式不正确")
        print("2. 网络连接问题")
        print("3. 飞书多维表格API限制或权限问题")
        print()
        print("建议检查.env文件中的FEISHU_WEBHOOK_URL配置是否正确.")
    
    if env_vars["SEND_MODE"] == "schedule":
        print()
        print("定时任务正在后台运行, 请勿关闭此窗口.")
        print("警告: 如果您关闭此窗口, 后台进程将继续运行.")
        print("下次启动时, 系统将检测到这些进程并提供终止选项.")
        print()
        print("按任意键退出将取消所有未完成的定时任务.")
        input()
    else:
        print()
        print("处理完成, 按任意键退出..")
        input()

if __name__ == "__main__":
    main() 