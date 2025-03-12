/**
 * 本地AI桥接模块
 * 用于调用本地Python AI处理脚本
 * @author 您的名字
 * @date 创建日期
 */

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const logger = require('./logger');

/**
 * 调用本地Python AI处理脚本生成摘要
 * @param {string} content 文章内容
 * @param {Object} config 配置对象
 * @returns {Promise<string>} 生成的摘要
 */
async function generateSummaryWithLocalAi(content, config) {
  try {
    // 创建临时文件存储内容
    const tempInputFile = path.join(os.tmpdir(), `article_${Date.now()}.txt`);
    const tempOutputFile = path.join(os.tmpdir(), `summary_${Date.now()}.txt`);
    
    // 写入内容到临时文件
    await fs.writeFile(tempInputFile, content, 'utf-8');
    
    // 构建命令参数
    const args = [
      path.join(__dirname, 'local_ai.py'),
      '--mode', 'summary',
      '--input', tempInputFile,
      '--output', tempOutputFile
    ];
    
    // 如果指定了模型，添加模型参数
    if (config.localAiModel) {
      args.push('--model', config.localAiModel);
    }
    
    // 执行Python脚本
    logger.info(`正在调用本地AI处理脚本生成摘要...`);
    await executeCommand('python', args);
    
    // 读取结果
    const summary = await fs.readFile(tempOutputFile, 'utf-8');
    
    // 清理临时文件
    await Promise.all([
      fs.unlink(tempInputFile).catch(() => {}),
      fs.unlink(tempOutputFile).catch(() => {})
    ]);
    
    return summary.trim();
  } catch (error) {
    logger.error('调用本地AI生成摘要失败:', error.message);
    return '生成摘要失败';
  }
}

/**
 * 调用本地Python AI处理脚本生成每日摘要
 * @param {Array} articles 文章列表
 * @param {Object} config 配置对象
 * @returns {Promise<string>} 生成的每日摘要
 */
async function generateDailySummaryWithLocalAi(articles, config) {
  try {
    // 创建临时文件存储内容
    const tempInputFile = path.join(os.tmpdir(), `articles_${Date.now()}.json`);
    const tempOutputFile = path.join(os.tmpdir(), `daily_summary_${Date.now()}.txt`);
    
    // 写入内容到临时文件
    await fs.writeFile(tempInputFile, JSON.stringify(articles), 'utf-8');
    
    // 构建命令参数
    const args = [
      path.join(__dirname, 'local_ai.py'),
      '--mode', 'daily',
      '--input', tempInputFile,
      '--output', tempOutputFile
    ];
    
    // 如果指定了模型，添加模型参数
    if (config.localAiModel) {
      args.push('--model', config.localAiModel);
    }
    
    // 执行Python脚本
    logger.info(`正在调用本地AI处理脚本生成每日摘要...`);
    await executeCommand('python', args);
    
    // 读取结果
    const summary = await fs.readFile(tempOutputFile, 'utf-8');
    
    // 清理临时文件
    await Promise.all([
      fs.unlink(tempInputFile).catch(() => {}),
      fs.unlink(tempOutputFile).catch(() => {})
    ]);
    
    return summary.trim();
  } catch (error) {
    logger.error('调用本地AI生成每日摘要失败:', error.message);
    return '生成每日摘要失败';
  }
}

/**
 * 执行命令
 * @param {string} command 命令
 * @param {Array} args 参数
 * @returns {Promise<void>}
 */
function executeCommand(command, args) {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args);
    
    let stdout = '';
    let stderr = '';
    
    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    process.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`命令执行失败，退出码: ${code}, 错误: ${stderr}`));
      }
    });
    
    process.on('error', (err) => {
      reject(new Error(`命令执行错误: ${err.message}`));
    });
  });
}

module.exports = {
  generateSummaryWithLocalAi,
  generateDailySummaryWithLocalAi
}; 