/**
 * AI处理模块
 * 用于调用OpenAI格式的API（如通义千问、火山引擎等）处理文章内容
 * @author 您的名字
 * @date 创建日期
 */

const axios = require('axios');
const logger = require('./logger');
const localAiBridge = require('./local-ai-bridge');
const prompts = require('./prompts');

/**
 * 使用OpenAI格式的API生成文章摘要
 * @param {string} content 文章内容
 * @param {Object} config 配置对象，包含API密钥和URL
 * @returns {Promise<string>} 生成的摘要
 */
async function generateSummary(content, config) {
  try {
    // 如果配置了使用本地AI，则调用本地AI处理
    if (config.useLocalAi) {
      return await localAiBridge.generateSummaryWithLocalAi(content, config);
    }
    
    // 检查必要的配置
    if (!config.aiApiKey || !config.aiApiUrl) {
      logger.error('缺少AI API配置，请检查环境变量');
      return '生成摘要失败：缺少API配置';
    }
    
    // 获取提示词
    const promptTemplate = prompts.getArticleSummaryPrompt(content);
    
    // 构建请求体
    const requestBody = {
      model: config.aiModel || "gpt-3.5-turbo", // 默认模型，可以是通义千问或火山引擎的模型ID
      messages: [
        {
          role: "system",
          content: promptTemplate.system
        },
        {
          role: "user",
          content: promptTemplate.user
        }
      ],
      temperature: 0.7,
      max_tokens: 500
    };

    // 根据不同API服务商调整请求体
    if (config.aiProvider === 'qianwen') {
      // 通义千问API格式
      requestBody.parameters = {
        temperature: 0.7,
        max_tokens: 500
      };
      delete requestBody.temperature;
      delete requestBody.max_tokens;
    } else if (config.aiProvider === 'volcengine') {
      // 火山引擎API格式
      requestBody.parameters = {
        temperature: 0.7,
        max_tokens: 500
      };
      delete requestBody.temperature;
      delete requestBody.max_tokens;
    }

    // 发送请求
    logger.info(`正在调用${config.aiProvider || 'OpenAI格式'}API生成摘要...`);
    const response = await axios.post(
      config.aiApiUrl,
      requestBody,
      {
        headers: {
          'Authorization': `Bearer ${config.aiApiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // 根据不同API的返回格式提取结果
    let summary = '';
    if (response.data.choices && response.data.choices.length > 0) {
      // OpenAI格式
      summary = response.data.choices[0].message.content;
    } else if (response.data.output && response.data.output.text) {
      // 通义千问格式
      summary = response.data.output.text;
    } else if (response.data.data && response.data.data.text) {
      // 火山引擎格式
      summary = response.data.data.text;
    } else {
      logger.warn('未能识别的API返回格式:', JSON.stringify(response.data));
      summary = '无法生成摘要';
    }

    return summary.trim();
  } catch (error) {
    logger.error('生成摘要失败:', error.message);
    if (error.response) {
      logger.error('API响应:', JSON.stringify(error.response.data));
    }
    return '生成摘要失败';
  }
}

/**
 * 生成每日文章汇总报告
 * @param {Array} articles 文章列表（包含摘要）
 * @param {Object} config 配置对象，包含API密钥和URL
 * @returns {Promise<string>} 生成的每日汇总报告
 */
async function generateDailySummary(articles, config) {
  try {
    // 如果配置了使用本地AI，则调用本地AI处理
    if (config.useLocalAi) {
      return await localAiBridge.generateDailySummaryWithLocalAi(articles, config);
    }
    
    // 检查必要的配置
    if (!config.aiApiKey || !config.aiApiUrl) {
      logger.error('缺少AI API配置，请检查环境变量');
      return '生成每日摘要失败：缺少API配置';
    }
    
    // 准备文章信息
    const articlesText = articles.map(article => 
      `标题: ${article.title}\n作者: ${article.author || '未知'}\n来源: ${article.source || '未知'}\n摘要: ${article.summary || '无摘要'}\n链接: ${article.link}\n\n`
    ).join('---\n\n');
    
    // 获取今天的日期
    const today = new Date().toISOString().split('T')[0];
    
    // 获取提示词
    let promptTemplate;
    if (config.summaryType === 'beverage') {
      // 饮料行业专用摘要
      promptTemplate = prompts.getBeverageIndustrySummaryPrompt(today, articlesText);
    } else {
      // 通用摘要
      promptTemplate = prompts.getGeneralDailySummaryPrompt(today, articlesText);
    }
    
    // 构建请求体
    const requestBody = {
      model: config.aiModel || "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: promptTemplate.system
        },
        {
          role: "user",
          content: promptTemplate.user
        }
      ],
      temperature: 0.7,
      max_tokens: 2000
    };

    // 根据不同API服务商调整请求体
    if (config.aiProvider === 'qianwen') {
      // 通义千问API格式
      requestBody.parameters = {
        temperature: 0.7,
        max_tokens: 2000
      };
      delete requestBody.temperature;
      delete requestBody.max_tokens;
    } else if (config.aiProvider === 'volcengine') {
      // 火山引擎API格式
      requestBody.parameters = {
        temperature: 0.7,
        max_tokens: 2000
      };
      delete requestBody.temperature;
      delete requestBody.max_tokens;
    }

    // 发送请求
    logger.info(`正在调用${config.aiProvider || 'OpenAI格式'}API生成每日摘要...`);
    const response = await axios.post(
      config.aiApiUrl,
      requestBody,
      {
        headers: {
          'Authorization': `Bearer ${config.aiApiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // 提取结果
    let summary = '';
    if (response.data.choices && response.data.choices.length > 0) {
      // OpenAI格式
      summary = response.data.choices[0].message.content;
    } else if (response.data.output && response.data.output.text) {
      // 通义千问格式
      summary = response.data.output.text;
    } else if (response.data.data && response.data.data.text) {
      // 火山引擎格式
      summary = response.data.data.text;
    } else {
      logger.warn('未能识别的API返回格式:', JSON.stringify(response.data));
      summary = '无法生成每日摘要';
    }

    return summary.trim();
  } catch (error) {
    logger.error('生成每日摘要失败:', error.message);
    if (error.response) {
      logger.error('API响应:', JSON.stringify(error.response.data));
    }
    return '生成每日摘要失败';
  }
}

module.exports = {
  generateSummary,
  generateDailySummary
}; 