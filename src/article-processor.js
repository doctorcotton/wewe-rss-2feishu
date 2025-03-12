/**
 * 公众号文章处理模块
 * 用于获取公众号文章、调用AI API总结内容并存储到每日MD文件中
 * @author 您的名字
 * @date 创建日期
 */

const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const logger = require('./logger');
const { sanitizeText } = require('./webhook-processor');
const aiProcessor = require('./ai-processor');

/**
 * 将文章内容保存到每日MD文件中
 * @param {Array} articles 文章列表
 * @param {string} summaryContent AI生成的摘要内容
 * @returns {Promise<string>} 文件保存路径
 */
async function saveArticlesToDailyMdFile(articles, summaryContent) {
  try {
    // 创建data/daily目录（如果不存在）
    const dailyDir = path.join(process.cwd(), 'data', 'daily');
    await fs.mkdir(dailyDir, { recursive: true });
    
    // 获取当前日期作为文件名
    const today = new Date().toISOString().split('T')[0]; // 格式: YYYY-MM-DD
    const filePath = path.join(dailyDir, `${today}.md`);
    
    // 生成MD文件内容
    let mdContent = `# 每日公众号文章汇总 (${today})\n\n`;
    
    // 添加AI生成的摘要
    mdContent += `## 今日摘要\n\n${summaryContent}\n\n`;
    
    // 添加文章列表
    mdContent += `## 文章列表\n\n`;
    
    articles.forEach((article, index) => {
      mdContent += `### ${index + 1}. ${article.title}\n\n`;
      mdContent += `- **来源**: ${article.source || '未知来源'}\n`;
      mdContent += `- **作者**: ${article.author || '未知作者'}\n`;
      mdContent += `- **发布时间**: ${article.pubDate || '未知时间'}\n`;
      mdContent += `- **链接**: [阅读原文](${article.link})\n\n`;
      
      // 添加文章摘要（如果有）
      if (article.summary) {
        mdContent += `#### 摘要\n\n${article.summary}\n\n`;
      }
      
      // 添加分隔线
      mdContent += `---\n\n`;
    });
    
    // 写入文件
    await fs.writeFile(filePath, mdContent, 'utf-8');
    
    logger.info(`成功将${articles.length}篇文章保存到每日MD文件: ${filePath}`);
    return filePath;
  } catch (error) {
    logger.error('保存文章到每日MD文件失败:', error.message);
    throw error;
  }
}

/**
 * 从每日MD文件中读取文章内容
 * @param {string} date 日期字符串，格式为YYYY-MM-DD，默认为今天
 * @returns {Promise<string>} MD文件内容
 */
async function readDailyMdFile(date) {
  try {
    // 如果未指定日期，使用今天的日期
    const targetDate = date || new Date().toISOString().split('T')[0];
    const filePath = path.join(process.cwd(), 'data', 'daily', `${targetDate}.md`);
    
    // 检查文件是否存在
    try {
      await fs.access(filePath);
    } catch (error) {
      logger.warn(`${targetDate}的每日MD文件不存在`);
      return null;
    }
    
    // 读取文件内容
    const content = await fs.readFile(filePath, 'utf-8');
    return content;
  } catch (error) {
    logger.error('读取每日MD文件失败:', error.message);
    return null;
  }
}

/**
 * 处理一批文章，包括生成摘要和保存到MD文件
 * @param {Array} articles 文章列表
 * @param {Object} config 配置对象，包含AI API密钥和URL
 * @returns {Promise<string>} 处理结果
 */
async function processArticlesBatch(articles, config) {
  try {
    logger.info(`开始处理${articles.length}篇文章...`);
    
    // 为每篇文章生成摘要
    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      logger.info(`正在为文章"${article.title}"生成摘要 (${i+1}/${articles.length})...`);
      
      // 准备文章内容
      const articleContent = `标题: ${article.title}\n作者: ${article.author || '未知'}\n来源: ${article.source || '未知'}\n内容: ${article.content || '无内容'}\n链接: ${article.link}\n\n`;
      
      // 生成摘要
      article.summary = await aiProcessor.generateSummary(articleContent, config);
    }
    
    // 生成每日汇总摘要
    logger.info('正在生成每日汇总摘要...');
    const summaryContent = await aiProcessor.generateDailySummary(articles, config);
    
    // 保存到每日MD文件
    logger.info('正在保存到每日MD文件...');
    const filePath = await saveArticlesToDailyMdFile(articles, summaryContent);
    
    return `成功处理${articles.length}篇文章并保存到${filePath}`;
  } catch (error) {
    logger.error('处理文章批次失败:', error.message);
    return '处理文章批次失败，请查看日志';
  }
}

module.exports = {
  saveArticlesToDailyMdFile,
  readDailyMdFile,
  processArticlesBatch
}; 