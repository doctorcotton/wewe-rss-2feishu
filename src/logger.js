const winston = require('winston');
const path = require('path');
const fs = require('fs');
require('winston-daily-rotate-file');

// 确保日志目录存在
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// 获取当前时间戳，用于生成唯一的日志文件名
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const runLogFilename = `run-${timestamp}.log`;
const mdJsonLogFilename = `md-json-${timestamp}.log`;

/**
 * 创建Winston日志记录器
 * @type {winston.Logger}
 */
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'wewe-rss-processor' },
  transports: [
    // 错误日志
    new winston.transports.File({
      filename: path.join(logDir, `error-${runLogFilename}`),
      level: 'error',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    }),
    // 每次运行的完整日志
    new winston.transports.File({
      filename: path.join(logDir, runLogFilename),
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    }),
    // MD转JSON的专门日志
    new winston.transports.File({
      filename: path.join(logDir, mdJsonLogFilename),
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message, type, content }) => {
          return `${timestamp} [${level.toUpperCase()}] [${type || 'GENERAL'}] ${message}\n${content ? JSON.stringify(content, null, 2) : ''}\n`;
        })
      )
    })
  ]
});

// 在非生产环境下，同时输出到控制台
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.printf(info => {
        const { timestamp, level, message, ...rest } = info;
        return `${timestamp} ${level}: ${message} ${Object.keys(rest).length ? JSON.stringify(rest, null, 2) : ''}`;
      })
    )
  }));
}

/**
 * 记录MD转JSON的相关日志
 * @param {string} type 日志类型（'MD_RECEIVED' 或 'JSON_SENT'）
 * @param {string} message 日志消息
 * @param {object|string} content 具体内容
 */
logger.logMdJson = function(type, message, content) {
  this.info(message, { type, content });
};

/**
 * 清理旧日志文件，只保留最近的3个运行日志
 */
function cleanOldLogs() {
  try {
    const files = fs.readdirSync(logDir);
    
    // 按类型筛选日志文件
    const runLogFiles = files.filter(file => file.startsWith('run-'));
    const mdJsonLogFiles = files.filter(file => file.startsWith('md-json-'));
    
    // 清理运行日志
    cleanLogsByType(runLogFiles, 3);
    // 清理MD-JSON日志
    cleanLogsByType(mdJsonLogFiles, 3);
  } catch (error) {
    console.error('清理旧日志文件失败:', error);
  }
}

/**
 * 按类型清理日志文件
 * @param {string[]} files 文件列表
 * @param {number} keepCount 保留数量
 */
function cleanLogsByType(files, keepCount) {
  // 按修改时间排序（从新到旧）
  const sortedFiles = files.map(file => {
    const filePath = path.join(logDir, file);
    const stats = fs.statSync(filePath);
    return { file, path: filePath, mtime: stats.mtime };
  }).sort((a, b) => b.mtime - a.mtime);
  
  // 如果超过指定数量，删除旧的
  if (sortedFiles.length > keepCount) {
    sortedFiles.slice(keepCount).forEach(fileInfo => {
      fs.unlinkSync(fileInfo.path);
      console.log(`已删除旧日志文件: ${fileInfo.file}`);
      
      // 删除对应的错误日志文件
      const errorFilePath = path.join(logDir, `error-${fileInfo.file}`);
      if (fs.existsSync(errorFilePath)) {
        fs.unlinkSync(errorFilePath);
        console.log(`已删除旧错误日志文件: error-${fileInfo.file}`);
      }
    });
  }
}

// 启动时清理一次旧日志
cleanOldLogs();

module.exports = logger; 