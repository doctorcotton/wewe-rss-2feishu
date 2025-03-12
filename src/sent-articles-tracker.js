/**
 * 已发送文章跟踪模块
 * 用于存储和检查已发送的文章标题，避免重复发送
 * @author 您的名字
 * @date 创建日期
 */

const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

// 存储文件路径
const SENT_ARTICLES_FILE = path.join(process.cwd(), 'data', 'sent-articles.json');

/**
 * 标准化文章标题，用于比较
 * 去除多余空格，转换为小写，以确保比较的一致性
 * @param {string} title 文章标题
 * @returns {string} 标准化后的标题
 */
function normalizeTitle(title) {
  if (!title) return '';
  // 去除多余空格，转换为小写
  return title.trim().toLowerCase();
}

/**
 * 清空并重新创建已发送文章记录文件
 * @returns {Promise<void>}
 */
async function resetSentArticlesFile() {
  try {
    // 确保data目录存在
    const dataDir = path.join(process.cwd(), 'data');
    await fs.mkdir(dataDir, { recursive: true });
    
    // 创建一个空的列表
    await fs.writeFile(SENT_ARTICLES_FILE, JSON.stringify({ titles: [] }, null, 2), { encoding: 'utf8' });
    logger.info('已重置已发送文章记录文件');
  } catch (error) {
    logger.error('重置已发送文章记录文件失败:', error);
    throw error;
  }
}

/**
 * 加载已发送的文章标题列表
 * @returns {Promise<Array>} 已发送的文章标题列表
 */
async function loadSentArticles() {
  try {
    // 检查文件是否存在
    try {
      await fs.access(SENT_ARTICLES_FILE);
    } catch (error) {
      // 文件不存在，创建一个空的列表
      logger.info('已发送文章记录文件不存在，将创建新文件');
      await resetSentArticlesFile();
      return { titles: [] };
    }
    
    // 读取文件内容
    const content = await fs.readFile(SENT_ARTICLES_FILE, { encoding: 'utf8' });
    
    try {
      const data = JSON.parse(content);
      
      // 兼容旧格式数据
      if (data.articles && !data.titles) {
        // 将旧格式转换为新格式
        const titles = data.articles.map(article => article.title);
        return { titles: [...new Set(titles)] }; // 使用Set去重
      }
      
      return data;
    } catch (parseError) {
      // JSON 解析错误，重置文件
      logger.error('解析已发送文章记录文件失败，将重置文件:', parseError);
      await resetSentArticlesFile();
      return { titles: [] };
    }
  } catch (error) {
    logger.error('加载已发送文章列表失败:', error);
    // 返回一个空列表
    return { titles: [] };
  }
}

/**
 * 保存已发送的文章标题列表
 * @param {Object} sentArticles 包含已发送文章标题的对象
 * @returns {Promise<void>}
 */
async function saveSentArticles(sentArticles) {
  try {
    // 确保data目录存在
    const dataDir = path.join(process.cwd(), 'data');
    await fs.mkdir(dataDir, { recursive: true });
    
    // 写入文件，使用JSON.stringify的第二个参数为null，第三个参数为2，确保格式化输出
    await fs.writeFile(SENT_ARTICLES_FILE, JSON.stringify(sentArticles, null, 2), { encoding: 'utf8' });
    logger.info(`已保存${sentArticles.titles.length}篇已发送文章记录`);
  } catch (error) {
    logger.error('保存已发送文章列表失败:', error);
    throw error;
  }
}

/**
 * 添加新发送的文章标题到列表
 * @param {Array} articles 新发送的文章列表
 * @returns {Promise<void>}
 */
async function addSentArticles(articles) {
  try {
    // 加载现有的已发送文章标题列表
    const sentArticles = await loadSentArticles();
    
    // 添加新文章标题到列表（添加去重逻辑）
    let addedCount = 0;
    articles.forEach(article => {
      if (!article.title) return; // 跳过没有标题的文章
      
      const normalizedTitle = normalizeTitle(article.title);
      
      // 检查标准化后的文章标题是否已存在于列表中
      const isDuplicate = sentArticles.titles.some(title => 
        normalizeTitle(title) === normalizedTitle
      );
      
      if (!isDuplicate) {
        sentArticles.titles.push(article.title);
        addedCount++;
      }
    });
    
    // 保存更新后的列表
    await saveSentArticles(sentArticles);
    
    logger.info(`已添加${addedCount}篇新发送的文章到记录，当前共有${sentArticles.titles.length}篇记录`);
  } catch (error) {
    logger.error('添加已发送文章失败:', error);
    throw error;
  }
}

/**
 * 检查文章是否已经发送过
 * @param {Object} article 要检查的文章
 * @returns {Promise<boolean>} 如果文章已经发送过，返回true
 */
async function isArticleSent(article) {
  try {
    if (!article || !article.title) return false; // 没有标题的文章视为未发送
    
    // 加载已发送文章标题列表
    const sentArticles = await loadSentArticles();
    
    // 标准化要检查的文章标题
    const normalizedTitle = normalizeTitle(article.title);
    
    // 检查标准化后的文章标题是否已存在
    return sentArticles.titles.some(title => 
      normalizeTitle(title) === normalizedTitle
    );
  } catch (error) {
    logger.error('检查文章是否已发送失败:', error);
    // 出错时返回false，允许发送
    return false;
  }
}

/**
 * 过滤掉已发送过的文章
 * @param {Array} articles 要过滤的文章列表
 * @returns {Promise<Array>} 过滤后的文章列表
 */
async function filterSentArticles(articles) {
  try {
    // 加载已发送文章标题列表
    const sentArticles = await loadSentArticles();
    
    // 过滤掉已发送的文章
    const filteredArticles = articles.filter(article => {
      if (!article || !article.title) return false; // 过滤掉没有标题的文章
      
      const normalizedTitle = normalizeTitle(article.title);
      return !sentArticles.titles.some(title => 
        normalizeTitle(title) === normalizedTitle
      );
    });
    
    logger.info(`过滤已发送文章: 原有${articles.length}篇，过滤后剩余${filteredArticles.length}篇`);
    
    return filteredArticles;
  } catch (error) {
    logger.error('过滤已发送文章失败:', error);
    // 出错时返回原始列表
    return articles;
  }
}

module.exports = {
  loadSentArticles,
  saveSentArticles,
  addSentArticles,
  isArticleSent,
  filterSentArticles,
  resetSentArticlesFile
}; 