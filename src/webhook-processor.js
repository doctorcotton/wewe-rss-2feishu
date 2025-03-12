/**
 * 飞书多维表格Webhook处理模块
 * 用于通过Webhook向飞书多维表格发送数据和接收webhook请求
 * @author 您的名字
 * @date 创建日期
 */

const axios = require('axios');
const logger = require('./logger');
require('dotenv').config();

/**
 * 获取配置的Webhook URL
 * @param {string} type URL类型，可选值：'article'或'summary'
 * @returns {string} Webhook URL
 */
function getWebhookUrl(type = 'article') {
  if (type === 'article') {
    // 优先使用FEISHU_ARTICLE_WEBHOOK_URL，如果不存在则使用FEISHU_WEBHOOK_URL
    return process.env.FEISHU_ARTICLE_WEBHOOK_URL || process.env.FEISHU_WEBHOOK_URL;
  } else if (type === 'summary') {
    // 优先使用FEISHU_SUMMARY_WEBHOOK_URL，如果不存在则使用FEISHU_WEBHOOK_URL
    return process.env.FEISHU_SUMMARY_WEBHOOK_URL || process.env.FEISHU_WEBHOOK_URL;
  }
  // 默认返回FEISHU_WEBHOOK_URL
  return process.env.FEISHU_WEBHOOK_URL;
}

/**
 * 通过Webhook发送文章数据到飞书多维表格
 * @param {Array} articles 文章列表
 * @param {string} [webhookUrl] 飞书Webhook URL，如果不提供则使用配置的文章记录URL
 * @returns {Promise<string>} 处理结果
 */
async function sendArticlesToFeishuByWebhook(articles, webhookUrl) {
  try {
    // 如果未提供webhookUrl，则使用配置的文章记录URL
    const targetUrl = webhookUrl || getWebhookUrl('article');
    
    // 检查参数
    if (!Array.isArray(articles) || articles.length === 0) {
      logger.error('发送失败: 文章列表为空或无效');
      return '发送失败: 文章列表为空或无效';
    }
    
    if (!targetUrl || typeof targetUrl !== 'string') {
      logger.error('发送失败: Webhook URL无效');
      return '发送失败: Webhook URL无效';
    }
    
    // 验证URL格式
    try {
      new URL(targetUrl);
    } catch (error) {
      logger.error(`发送失败: Webhook URL格式无效 - ${targetUrl}`);
      return `发送失败: Webhook URL格式无效 - ${targetUrl}`;
    }
    
    logger.info(`开始发送${articles.length}篇文章到飞书多维表格...`);
    logger.debug(`使用的Webhook URL: ${targetUrl}`);
    
    // 记录成功发送的文章数量
    let successCount = 0;
    
    // 准备发送的数据
    const records = articles.map(article => ({
      fields: {
        "标题": sanitizeText(article.title || '无标题'),
        "链接": article.link || '',
        "发布日期": article.pubDate || new Date().toISOString(),
        "作者": article.author || '未知',
        "来源": article.source || '未知来源'
      }
    }));
    
    logger.info(`已准备${records.length}条记录，开始分批发送...`);
    
    // 逐个发送文章，避免一次发送过多数据
    for (let i = 0; i < records.length; i += 10) {
      try {
        const batch = records.slice(i, i + 10);
        logger.info(`正在发送第${i/10 + 1}批，共${batch.length}条记录...`);
        
        // 构建payload
        const payload = {
          records: batch
        };
        
        // 打印JSON格式以便检查
        logger.debug('准备发送的JSON数据:', JSON.stringify(payload, null, 2));
        
        // 发送到飞书Webhook
        const response = await axios.post(targetUrl, payload, {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 10000 // 10秒超时
        });
        
        logger.info(`第${i/10 + 1}批发送成功，响应状态: ${response.status}`);
        logger.debug('响应数据:', JSON.stringify(response.data, null, 2));
        
        successCount += batch.length;
      } catch (batchError) {
        logger.error(`第${i/10 + 1}批发送失败:`, batchError.message);
        if (batchError.response) {
          logger.error('响应状态:', batchError.response.status);
          logger.error('响应数据:', JSON.stringify(batchError.response.data, null, 2));
        }
      }
    }
    
    if (successCount === 0) {
      return '所有批次发送失败，请检查日志';
    } else if (successCount < articles.length) {
      return `部分发送成功: ${successCount}/${articles.length}篇文章已发送到飞书多维表格`;
    } else {
      return `成功通过Webhook发送了${successCount}篇文章到飞书多维表格`;
    }
  } catch (error) {
    logger.error('通过Webhook发送数据失败:', error.message);
    logger.error('错误详情:', error.response ? JSON.stringify(error.response.data, null, 2) : error);
    return '发送数据失败，请查看日志';
  }
}

/**
 * 定时逐条发送文章到飞书多维表格
 * @param {Array} articles 文章列表
 * @param {string} [webhookUrl] 飞书Webhook URL，如果不提供则使用配置的文章记录URL
 * @param {number} intervalMinutes 发送间隔（分钟）
 * @param {Function} [callback] 回调函数，在所有文章发送完成后调用，参数为已发送的文章数组
 * @returns {Promise<string>} 处理结果
 */
async function scheduleArticlesToFeishuByWebhook(articles, webhookUrl, intervalMinutes = 60, callback) {
  try {
    // 如果未提供webhookUrl，则使用配置的文章记录URL
    const targetUrl = webhookUrl || getWebhookUrl('article');
    
    // 检查参数
    if (!Array.isArray(articles) || articles.length === 0) {
      logger.error('定时发送失败: 文章列表为空或无效');
      return '定时发送失败: 文章列表为空或无效';
    }
    
    if (!targetUrl || typeof targetUrl !== 'string') {
      logger.error('定时发送失败: Webhook URL无效');
      return '定时发送失败: Webhook URL无效';
    }
    
    // 确保intervalMinutes是数字，并且允许小数值
    const interval = parseFloat(intervalMinutes);
    // 如果解析结果为NaN或者小于等于0，则使用默认值1
    const finalInterval = (isNaN(interval) || interval <= 0) ? 1 : interval;
    logger.info(`开始安排${articles.length}篇文章的定时发送，间隔为${finalInterval}分钟`);
    logger.debug(`使用的Webhook URL: ${targetUrl}`);
    
    // 记录已安排的文章数量
    let scheduledCount = 0;
    // 记录已发送的文章
    const sentArticles = [];
    // 记录发送失败的文章
    const failedArticles = [];
    // 记录总的文章数量
    const totalArticles = articles.length;
    
    // 导入node-schedule
    let schedule;
    try {
      schedule = require('node-schedule');
    } catch (error) {
      logger.error('导入node-schedule模块失败:', error.message);
      return '定时发送失败: 无法导入node-schedule模块，请确保已安装该依赖';
    }
    
    const scheduleJobs = [];
    
    // 为每篇文章创建定时任务
    for (let index = 0; index < articles.length; index++) {
      try {
        const article = articles[index];
        
        // 计算延迟时间（分钟）
        const delayMinutes = index * finalInterval;
        
        // 创建定时任务
        const scheduleTime = new Date(Date.now() + delayMinutes * 60 * 1000);
        
        logger.info(`安排文章 ${index + 1}/${articles.length}: ${article.title} 将在 ${scheduleTime.toLocaleString()} 发送`);
        
        // 使用node-schedule安排任务
        const job = schedule.scheduleJob(scheduleTime, async function() {
          try {
            logger.info(`正在发送文章: ${article.title}`);
            
            // 准备发送的数据
            const payload = {
              records: [
                {
                  fields: {
                    "标题": sanitizeText(article.title),
                    "链接": article.link,
                    "发布日期": article.pubDate,
                    "作者": article.author,
                    "来源": article.source
                  }
                }
              ]
            };
            
            // 打印JSON格式以便检查
            logger.debug('准备发送的JSON数据:', JSON.stringify(payload, null, 2));
            
            try {
              // 发送到飞书Webhook
              await axios.post(targetUrl, payload);
              logger.info(`成功发送文章: ${article.title}`);
              
              // 添加到已发送文章列表
              sentArticles.push(article);
            } catch (error) {
              logger.error(`发送文章失败: ${article.title}`, error.message);
              failedArticles.push(article);
            } finally {
              // 检查是否所有文章都已处理（无论成功还是失败）
              if (sentArticles.length + failedArticles.length === scheduledCount) {
                // 记录成功率
                const successRate = (sentArticles.length / scheduledCount * 100).toFixed(2);
                logger.info(`所有${scheduledCount}篇文章处理完成，成功: ${sentArticles.length}，失败: ${failedArticles.length}，成功率: ${successRate}%`);
                
                // 只在所有安排的文章都处理完成后调用回调函数
                if (typeof callback === 'function') {
                  try {
                    logger.info(`所有${scheduledCount}篇文章已处理完成，调用回调函数...`);
                    await callback(sentArticles);
                  } catch (callbackError) {
                    logger.error(`回调函数执行失败:`, callbackError.message);
                  }
                }
              }
            }
          } catch (error) {
            logger.error(`处理定时任务失败: ${article.title}`, error.message);
            failedArticles.push(article);
            
            // 即使处理失败，也检查是否所有文章都已处理
            if (sentArticles.length + failedArticles.length === scheduledCount) {
              if (typeof callback === 'function') {
                try {
                  logger.info(`所有${scheduledCount}篇文章已处理完成（含失败），调用回调函数...`);
                  await callback(sentArticles);
                } catch (callbackError) {
                  logger.error(`回调函数执行失败:`, callbackError.message);
                }
              }
            }
          }
        });
        
        // 确保任务被正确安排
        if (job) {
          scheduleJobs.push(job);
          scheduledCount++;
        } else {
          logger.error(`安排文章失败: ${article.title} - 无法创建定时任务`);
        }
      } catch (err) {
        logger.error(`安排文章失败: ${articles[index].title || '未知文章'}`, err.message);
      }
    }
    
    // 防止程序退出
    if (scheduledCount > 0) {
      logger.info(`已成功安排${scheduledCount}篇文章的定时发送，将在接下来的${scheduledCount * finalInterval}分钟内完成`);
      
      // 添加一个额外的任务，在所有文章发送完成后执行
      const finalTime = new Date(Date.now() + (scheduledCount * finalInterval + 1) * 60 * 1000);
      schedule.scheduleJob(finalTime, function() {
        logger.info('所有定时发送任务已完成');
        
        // 如果到了最终时间点但仍有文章未处理，强制调用回调
        if (sentArticles.length + failedArticles.length < scheduledCount && typeof callback === 'function') {
          try {
            logger.warn(`已到最终时间点，但仍有${scheduledCount - sentArticles.length - failedArticles.length}篇文章未处理，强制调用回调函数`);
            callback(sentArticles);
          } catch (callbackError) {
            logger.error(`强制回调函数执行失败:`, callbackError.message);
          }
        }
      });
    }
    
    // 返回结果
    return `成功安排了${scheduledCount}篇文章的定时发送，将在接下来的${scheduledCount * finalInterval}分钟内完成`;
  } catch (error) {
    logger.error('安排定时发送失败:', error.message);
    return '安排定时发送失败，请查看日志';
  }
}

/**
 * 发送每日摘要报告到飞书
 * @param {string} summary 摘要内容
 * @param {string} [webhookUrl] 飞书Webhook URL，如果不提供则使用配置的总结消息URL
 * @returns {Promise<void>}
 */
async function sendDailySummaryByWebhook(summary, webhookUrl) {
  try {
    // 如果未提供webhookUrl，则使用配置的总结消息URL
    const targetUrl = webhookUrl || getWebhookUrl('summary');
    
    if (!targetUrl || typeof targetUrl !== 'string') {
      logger.error('发送失败: 总结消息Webhook URL无效');
      return '发送失败: 总结消息Webhook URL无效';
    }
    
    logger.debug(`使用的Webhook URL: ${targetUrl}`);
    const today = new Date().toLocaleDateString('zh-CN');
    
    // 准备发送的数据 - 按照飞书多维表格webhook的格式
    const payload = {
      records: [
        {
          fields: {
            "标题": `每日资讯简报 - ${today}`,
            "内容": summary,
            "类型": "daily_summary",
            "处理状态": "已处理"
          }
        }
      ]
    };
    
    // 发送到飞书Webhook
    await axios.post(targetUrl, payload);
    
    logger.info('成功发送每日摘要到飞书');
    return '成功发送每日摘要到飞书';
  } catch (error) {
    logger.error('发送每日摘要失败:', error.message);
    logger.error('错误详情:', error.response ? error.response.data : error);
    return '发送每日摘要失败，请查看日志';
  }
}

/**
 * 处理接收到的webhook请求数据
 * @param {Object} requestBody webhook请求体
 * @param {string} targetWebhookUrl 目标飞书多维表格webhook URL
 * @returns {Promise<Object>} 处理结果
 */
async function processIncomingWebhook(requestBody, targetWebhookUrl) {
  try {
    logger.debug('收到webhook请求:', JSON.stringify(requestBody, null, 2));
    
    // 从请求体中提取数据，使用JSON路径
    const extractedData = {
      title: sanitizeText(extractValueByPath(requestBody, 'title') || extractValueByPath(requestBody, 'data.title')),
      link: extractValueByPath(requestBody, 'link') || extractValueByPath(requestBody, 'data.link'),
      pubDate: extractValueByPath(requestBody, 'pubDate') || extractValueByPath(requestBody, 'data.pubDate') || new Date().toISOString(),
      content: extractValueByPath(requestBody, 'content') || extractValueByPath(requestBody, 'data.content') || '',
      author: extractValueByPath(requestBody, 'author') || extractValueByPath(requestBody, 'data.author') || '未知',
      source: extractValueByPath(requestBody, 'source') || extractValueByPath(requestBody, 'data.source') || '外部来源'
    };
    
    logger.info('提取的数据:', extractedData);
    
    // 准备发送到飞书多维表格的数据
    const payload = {
      records: [
        {
          fields: {
            "标题": extractedData.title,
            "链接": extractedData.link,
            "发布日期": extractedData.pubDate,
            "作者": extractedData.author,
            "来源": extractedData.source
          }
        }
      ]
    };
    
    // 打印JSON格式以便检查
    logger.debug('准备发送的JSON数据:', JSON.stringify(payload, null, 2));
    
    // 发送到飞书多维表格webhook
    const response = await axios.post(targetWebhookUrl, payload);
    
    return {
      success: true,
      message: '成功处理webhook请求并发送到飞书多维表格',
      data: response.data
    };
  } catch (error) {
    logger.error('处理webhook请求失败:', error.message);
    logger.error('错误详情:', error.response ? error.response.data : error);
    
    return {
      success: false,
      message: '处理webhook请求失败',
      error: error.message
    };
  }
}

/**
 * 从对象中提取指定路径的值
 * @param {Object} obj 源对象
 * @param {string} path 路径，例如 'body.link'
 * @param {*} defaultValue 默认值
 * @returns {*} 提取的值
 */
function extractValueByPath(obj, path, defaultValue = null) {
  if (!obj || !path) return defaultValue;
  
  const parts = path.split('.');
  let current = obj;
  
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return defaultValue;
    }
    current = current[part];
  }
  
  return current !== undefined ? current : defaultValue;
}

/**
 * 清理文本中的特殊字符
 * @param {string} text 需要清理的文本
 * @returns {string} 清理后的文本
 */
function sanitizeText(text) {
  if (!text) return '';
  
  // 替换逗号、引号和其他可能导致问题的特殊字符
  return text.replace(/[,"\'\`\{\}\[\]\(\)\#\$\%\^\&\*\;\:\<\>\?\/\\]/g, ' ')
             .replace(/\s+/g, ' ')  // 将多个空格替换为单个空格
             .trim();  // 去除首尾空格
}

module.exports = {
  sendArticlesToFeishuByWebhook,
  scheduleArticlesToFeishuByWebhook,
  sendDailySummaryByWebhook,
  processIncomingWebhook,
  sanitizeText
}; 