/**
 * DIFY AI处理模块
 * 用于使用DIFY API处理文章内容
 */

const axios = require('axios');
const logger = require('./logger');

/**
 * 使用DIFY API处理文章内容
 * @param {Array} articles 文章列表
 * @param {string} apiKey DIFY API密钥
 * @param {string} apiUrl DIFY API地址
 * @returns {Promise<string>} 处理后的摘要内容
 */
async function processWithDify(articles, apiKey, apiUrl) {
  try {
    // 准备发送给DIFY的内容
    const articlesText = articles.map(article => 
      `标题: ${article.title}\n作者: ${article.author}\n内容: ${article.content.substring(0, 500)}...\n\n`
    ).join('---\n\n');
    
    const response = await axios.post(
      `${apiUrl}/completion-messages`, 
      {
        inputs: {},
        query: `请对以下微信公众号文章进行摘要和整合，生成一篇每日简报:\n\n${articlesText}`,
        response_mode: "blocking"
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return response.data.answer;
  } catch (error) {
    logger.error('DIFY处理失败:', error.message);
    return '内容处理失败，请查看日志';
  }
}

/**
 * 使用DIFY API生成每日摘要报告
 * @param {Array} articles 文章列表
 * @param {string} apiKey DIFY API密钥
 * @param {string} apiUrl DIFY API地址
 * @returns {Promise<string>} 每日摘要报告
 */
async function generateDailySummary(articles, apiKey, apiUrl) {
  try {
    // 获取今天的日期
    const today = new Date().toISOString().split('T')[0];
    
    // 准备发送给DIFY的内容
    const articlesText = articles.map(article => 
      `标题: ${article.title}\n作者: ${article.author}\n摘要: ${article.summary || '无摘要'}\n链接: ${article.link}\n\n`
    ).join('---\n\n');
    
    const response = await axios.post(
      `${apiUrl}/completion-messages`, 
      {
        inputs: {},
        query: `请根据以下文章信息，生成一份格式美观、内容精炼的每日资讯简报，日期为${today}:\n\n${articlesText}`,
        response_mode: "blocking"
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return response.data.answer;
  } catch (error) {
    logger.error('DIFY生成每日摘要报告失败:', error.message);
    return '生成每日摘要报告失败，请查看日志';
  }
}

module.exports = {
  processWithDify,
  generateDailySummary
}; 