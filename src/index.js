/**
 * 微信公众号内容自动化处理与推送主程序
 * @author cottondog
 * @date 创建日期
 */

const logger = require('./logger');

require('dotenv').config();
const axios = require('axios');
const { parseString } = require('xml2js');
const { promisify } = require('util');
const parseStringPromise = promisify(parseString);
const fs = require('fs').promises;
const path = require('path');
const schedule = require('node-schedule');
const cheerio = require('cheerio'); // 添加cheerio用于解析HTML

// 导入处理模块
const { 
  sendArticlesToFeishuByWebhook, 
  scheduleArticlesToFeishuByWebhook, 
  sendDailySummaryByWebhook,
  sanitizeText
} = require('./webhook-processor');
const feishuAiProcessor = require('./feishu-ai-processor');
const difyProcessor = require('./dify-processor');
const articleProcessor = require('./article-processor');
const aiProcessor = require('./ai-processor');
const sentArticlesTracker = require('./sent-articles-tracker'); // 导入已发送文章跟踪模块

// 从环境变量加载配置
const config = {
  weweRssUrl: process.env.WEWE_RSS_URL || 'http://localhost:4000',
  allFeedsUrl: process.env.ALL_FEEDS_URL || 'http://localhost:4000/feeds/all.atom',
  authCode: process.env.AUTH_CODE,
  feishuAppId: process.env.FEISHU_APP_ID,
  feishuAppSecret: process.env.FEISHU_APP_SECRET,
  feishuAppToken: process.env.FEISHU_APP_TOKEN,
  feishuTableId: process.env.FEISHU_TABLE_ID,
  feishuWebhookUrl: process.env.FEISHU_ARTICLE_WEBHOOK_URL || '',
  feishuSummaryWebhookUrl: process.env.FEISHU_SUMMARY_WEBHOOK_URL || '',
  difyApiKey: process.env.DIFY_API_KEY,
  difyApiUrl: process.env.DIFY_API_URL,
  // 优先使用SCHEDULE_TIME，如果不存在则使用默认值
  scheduleTime: process.env.SCHEDULE_TIME || '0 30 9 * * *',
  articleIntervalMinutes: parseFloat(process.env.ARTICLE_INTERVAL_MINUTES || '60'),
  summaryDelayMinutes: parseFloat(process.env.SUMMARY_DELAY_MINUTES || '2'),
  sendMode: process.env.SEND_MODE || 'batch', // 'batch' 或 'schedule'
  opmlFilePath: process.env.OPML_FILE_PATH || './WeWeRSS-All.opml', // OPML文件路径
  saveToDailyMd: process.env.SAVE_TO_DAILY_MD === 'true', // 是否保存到每日MD文件
  generateDailySummary: process.env.GENERATE_DAILY_SUMMARY === 'true', // 是否生成每日摘要
  // 广告过滤配置
  enableAdFilter: process.env.ENABLE_AD_FILTER === 'true', // 是否启用广告过滤
  adKeywords: (process.env.AD_KEYWORDS || '').split(',').filter(Boolean), // 广告关键词列表
  // 已发送文章过滤配置
  enableSentFilter: process.env.ENABLE_SENT_FILTER === 'true', // 是否启用已发送文章过滤
  // AI配置
  aiApiKey: process.env.AI_API_KEY, // AI API密钥
  aiApiUrl: process.env.AI_API_URL, // AI API地址
  aiModel: process.env.AI_MODEL, // AI模型名称
  aiProvider: process.env.AI_PROVIDER, // AI服务商，如'openai', 'qianwen', 'volcengine'等
  useLocalAi: process.env.USE_LOCAL_AI === 'true', // 是否使用本地AI
  localAiModel: process.env.LOCAL_AI_MODEL, // 本地AI模型名称
  summaryType: process.env.SUMMARY_TYPE || 'general', // 摘要类型，如'general', 'beverage'等
  // 推送配置
  pushToFeishu: process.env.PUSH_TO_FEISHU === 'true', // 是否推送到飞书
  pushToKoozhi: process.env.PUSH_TO_KOOZHI === 'true', // 是否推送到扣子
  koozhiApiKey: process.env.KOOZHI_API_KEY, // 扣子API密钥
  koozhiApiUrl: process.env.KOOZHI_API_URL || 'https://api.koozhi.ai/v1/messages', // 扣子API地址
  // 快速测试模式配置
  quickTestMode: process.env.QUICK_TEST_MODE === 'true', // 是否为快速测试模式
  quickTestArticleCount: parseInt(process.env.QUICK_TEST_ARTICLE_COUNT || '3', 10), // 快速测试模式下要处理的文章数量
  mdToJsonWebhookUrl: process.env.FEISHU_MD_TO_JSON_WEBHOOK_URL,
};

/**
 * 从OPML文件获取订阅源列表
 * @returns {Promise<Array>} 订阅源列表
 */
async function fetchSubscriptionsFromOpml() {
  try {
    // 读取OPML文件
    const opmlContent = await fs.readFile(config.opmlFilePath, 'utf-8');
    
    // 解析OPML文件
    const result = await parseStringPromise(opmlContent);
    
    // 提取订阅源信息
    const outlines = result.opml.body[0].outline || [];
    
    return outlines.map(outline => ({
      id: outline.$.text.replace(/\s+/g, ''), // 使用公众号名称作为ID，去除空格
      name: outline.$.text,
      url: outline.$.xmlUrl,
      htmlUrl: outline.$.htmlUrl
    }));
  } catch (error) {
    logger.error('解析OPML文件失败:', error.message);
    return [];
  }
}

/**
 * 从WeWeRSS的all.atom源获取所有文章
 * @returns {Promise<Array>} 文章列表
 */
async function fetchArticlesFromAllAtom() {
  try {
    logger.info(`开始从 ${config.allFeedsUrl} 获取所有文章...`);
    
    // 检查URL是否有效
    if (!config.allFeedsUrl || typeof config.allFeedsUrl !== 'string') {
      logger.error('无效的Atom源URL');
      return [];
    }
    
    // 获取Atom源内容
    let response;
    try {
      response = await axios.get(config.allFeedsUrl, { timeout: 10000 }); // 10秒超时
    } catch (error) {
      logger.error(`获取Atom源内容失败: ${error.message}`);
      if (error.response) {
        logger.error(`状态码: ${error.response.status}`);
      }
      return [];
    }
    
    if (!response || !response.data) {
      logger.error('获取Atom源内容失败: 响应为空');
      return [];
    }
    
    const atomContent = response.data;
    
    // 解析Atom内容
    let result;
    try {
      result = await parseStringPromise(atomContent);
    } catch (error) {
      logger.error(`解析Atom内容失败: ${error.message}`);
      return [];
    }
    
    // 检查是否有entry字段
    if (!result || !result.feed || !result.feed.entry) {
      logger.info('Atom源中没有找到文章条目');
      return [];
    }
    
    // 提取文章信息
    const entries = result.feed.entry;
    logger.info(`从Atom源中找到 ${entries.length} 篇文章`);
    
    const articles = entries.map(entry => {
      // 获取标题
      const title = entry.title && entry.title[0] ? entry.title[0]._ || entry.title[0] : '未知标题';
      
      // 获取原始微信公众号链接
      let originalLink = '';
      if (entry.link && entry.link.length > 0) {
        // 查找原始链接，通常是href属性中包含mp.weixin.qq.com的链接
        for (const link of entry.link) {
          const href = link.$ && link.$.href ? link.$.href : '';
          if (href.includes('mp.weixin.qq.com')) {
            originalLink = href;
            break;
          }
        }
        
        // 如果没有找到微信链接，使用第一个链接
        if (!originalLink && entry.link[0].$ && entry.link[0].$.href) {
          originalLink = entry.link[0].$.href;
        }
      }
      
      // 获取发布日期
      let pubDate = '';
      if (entry.published && entry.published[0]) {
        pubDate = entry.published[0];
      } else if (entry.updated && entry.updated[0]) {
        pubDate = entry.updated[0];
      }
      
      // 格式化日期为 YYYY-MM-DD HH:MM:SS
      if (pubDate) {
        const date = new Date(pubDate);
        if (!isNaN(date.getTime())) {
          pubDate = date.toISOString().replace('T', ' ').substring(0, 19);
        }
      }
      
      // 获取内容
      let content = '';
      if (entry.content && entry.content[0] && entry.content[0]._) {
        content = entry.content[0]._;
      } else if (entry.summary && entry.summary[0] && entry.summary[0]._) {
        content = entry.summary[0]._;
      }
      
      // 获取作者
      let author = '未知作者';
      if (entry.author && entry.author[0] && entry.author[0].name && entry.author[0].name[0]) {
        author = entry.author[0].name[0];
      }
      
      // 获取来源
      let source = '未知来源';
      if (entry.source && entry.source[0] && entry.source[0].title && entry.source[0].title[0]) {
        source = entry.source[0].title[0];
      } else if (result.feed.title && result.feed.title[0]) {
        // 如果条目没有来源，使用feed的标题作为来源
        source = result.feed.title[0]._ || result.feed.title[0];
      }
      
      return {
        title,
        link: originalLink,
        pubDate,
        content,
        author,
        source
      };
    }).filter(article => article.link && article.title); // 过滤掉没有链接或标题的文章
    
    logger.info(`成功解析 ${articles.length} 篇文章`);
    return articles;
  } catch (error) {
    logger.error('从Atom源获取文章失败:', error.message);
    logger.error(error.stack);
    return [];
  }
}

/**
 * 从WeWe RSS网页抓取文章列表
 * @returns {Promise<Array>} 文章列表
 */
async function scrapeArticlesFromWebPage() {
  try {
    logger.info('开始从WeWe RSS网页抓取文章...');
    
    // 获取主页HTML
    const response = await axios.get(config.weweRssUrl);
    const html = response.data;
    
    logger.info('成功获取WeWe RSS网页HTML');
    
    // 使用cheerio解析HTML
    const $ = cheerio.load(html);
    
    // 提取文章信息
    const articles = [];
    
    // 尝试多种选择器
    logger.info('尝试查找文章链接...');
    
    // 1. 尝试查找所有链接，这是最通用的方法
    $('a').each((index, element) => {
      try {
        const link = $(element).attr('href');
        
        // 检查是否是文章链接
        if (link && (link.includes('/article/') || link.includes('.html') || link.includes('mp.weixin.qq.com'))) {
          const title = $(element).text().trim() || $(element).attr('title') || '未知标题';
          
          // 尝试从父元素或相邻元素中找到日期
          let pubDate = '';
          const parentTr = $(element).closest('tr');
          
          if (parentTr.length > 0) {
            // 如果链接在表格行中，尝试获取同行中的日期单元格
            parentTr.find('td').each((i, td) => {
              const text = $(td).text().trim();
              if (text.match(/\d{4}-\d{2}-\d{2}/)) {
                pubDate = text;
              }
            });
          }
          
          // 如果没有找到日期，使用当前日期
          if (!pubDate) {
            pubDate = new Date().toISOString().split('T')[0] + ' 00:00:00';
          }
          
          // 构建完整链接
          const fullLink = link.startsWith('http') ? link : `${config.weweRssUrl}${link.startsWith('/') ? '' : '/'}${link}`;
          
          // 只添加微信公众号链接
          if (fullLink.includes('mp.weixin.qq.com')) {
            // 添加到文章列表
            articles.push({
              title,
              link: fullLink,
              pubDate,
              content: '', // 暂时不获取内容
              author: '', // 暂时不获取作者
              source: '未知来源'
            });
            
            logger.info(`找到微信公众号文章链接: ${title} (${fullLink})`);
          }
        }
      } catch (error) {
        logger.error('解析文章链接失败:', error.message);
      }
    });
    
    // 2. 尝试查找表格中的文章
    if (articles.length === 0) {
      logger.info('尝试从表格中查找文章...');
      
      $('table tr').each((index, row) => {
        try {
          // 跳过表头
          if (index === 0) return;
          
          const cells = $(row).find('td');
          
          if (cells.length >= 2) {
            // 假设第一列是标题，最后一列是日期
            const titleCell = $(cells[0]);
            const title = titleCell.text().trim();
            const link = titleCell.find('a').attr('href');
            
            // 最后一列可能是日期
            const dateCell = $(cells[cells.length - 1]);
            const pubDate = dateCell.text().trim();
            
            if (title && link && pubDate) {
              const fullLink = link.startsWith('http') ? link : `${config.weweRssUrl}${link.startsWith('/') ? '' : '/'}${link}`;
              
              // 只添加微信公众号链接
              if (fullLink.includes('mp.weixin.qq.com')) {
                articles.push({
                  title,
                  link: fullLink,
                  pubDate,
                  content: '', // 暂时不获取内容
                  author: '', // 暂时不获取作者
                  source: '未知来源'
                });
                
                logger.info(`从表格找到微信公众号文章: ${title} (${pubDate})`);
              }
            }
          }
        } catch (error) {
          logger.error('解析表格行失败:', error.message);
        }
      });
    }
    
    logger.info(`总共找到 ${articles.length} 篇文章`);
    return articles;
  } catch (error) {
    logger.error('从网页抓取文章失败:', error.message);
    logger.error(error.stack);
    return [];
  }
}

/**
 * 过滤最近24小时的文章
 * @param {Array} articles 文章列表
 * @returns {Array} 过滤后的文章列表
 */
function filterRecentArticles(articles) {
  const oneDayAgo = new Date();
  oneDayAgo.setHours(oneDayAgo.getHours() - 24);
  
  return articles.filter(article => {
    try {
      // 从截图中看，日期格式可能是 "YYYY-MM-DD HH:MM:SS"
      const pubDateStr = article.pubDate;
      
      // 尝试解析日期
      let pubDate;
      
      if (pubDateStr.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)) {
        // 标准格式: "YYYY-MM-DD HH:MM:SS"
        pubDate = new Date(pubDateStr.replace(' ', 'T') + 'Z');
      } else if (pubDateStr.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)) {
        // 没有秒的格式: "YYYY-MM-DD HH:MM"
        pubDate = new Date(pubDateStr.replace(' ', 'T') + ':00Z');
      } else {
        // 尝试直接解析
        pubDate = new Date(pubDateStr);
      }
      
      // 检查日期是否有效
      if (isNaN(pubDate.getTime())) {
        logger.error(`无效的日期格式: ${pubDateStr}`);
        return false;
      }
      
      logger.info(`文章日期: ${pubDateStr}, 解析后: ${pubDate.toISOString()}, 是否最近24小时: ${pubDate >= oneDayAgo}`);
      
      return pubDate >= oneDayAgo;
    } catch (error) {
      logger.error(`解析发布日期失败: ${article.pubDate}`, error.message);
      return false;
    }
  });
}

/**
 * 检查文章标题是否包含广告关键词
 * @param {string} title 文章标题
 * @returns {boolean} 如果包含广告关键词返回true，否则返回false
 */
function isAdvertisementTitle(title) {
  if (!title || !config.enableAdFilter) return false;
  
  // 使用环境变量中的广告关键词，如果没有配置则使用默认关键词
  const adKeywords = config.adKeywords.length > 0 ? config.adKeywords : [
    '抽奖', '中奖', '优惠券', '折扣', '促销', '特价', '限时', '秒杀', '免费领', 
    '免费送', '0元购', '立减', '优惠', '活动', '赠品', '买一送一', '折', '返现',
    '红包', '满减', '立省', '优享', '特惠', '限量', '爆款', '好礼', '专享价',
    '拼团', '砍价', '直降', '钜惠', '大促', '特卖', '优选', '尝鲜价', '首发价',
    '推广', '广告', 'AD', '赞助', '合作', '首发', '独家', '新品', '上新'
  ];
  
  // 检查标题是否包含广告关键词
  return adKeywords.some(keyword => title.includes(keyword));
}

/**
 * 获取飞书访问令牌
 * @returns {Promise<string>} 访问令牌
 */
async function getFeishuAccessToken() {
  try {
    const response = await axios.post(
      'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
      { app_id: config.feishuAppId, app_secret: config.feishuAppSecret }
    );
    
    return response.data.tenant_access_token;
  } catch (error) {
    logger.error('获取飞书访问令牌失败:', error.message);
    throw error;
  }
}

/**
 * 使用飞书多维表格处理文章内容
 * @param {Array} articles 文章列表
 * @returns {Promise<string>} 处理后的摘要内容
 */
async function processWithFeishuTable(articles) {
  try {
    // 获取访问令牌
    const accessToken = await getFeishuAccessToken();
    
    // 批量添加记录
    const records = [];
    for (const article of articles) {
      // 检查文章是否已存在
      const checkResponse = await axios.get(
        `https://open.feishu.cn/open-apis/bitable/v1/apps/${config.feishuAppToken}/tables/${config.feishuTableId}/records`,
        {
          params: {
            filter: `CurrentValue.[链接] = "${article.link}"`
          },
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      // 如果文章不存在，则添加
      if (checkResponse.data.data.total === 0) {
        const response = await axios.post(
          `https://open.feishu.cn/open-apis/bitable/v1/apps/${config.feishuAppToken}/tables/${config.feishuTableId}/records`,
          {
            fields: {
              '标题': sanitizeText(article.title),
              '链接': article.link,
              '发布日期': article.pubDate,
              '作者': article.author,
              '来源': article.source
            }
          },
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        records.push(response.data.data);
      }
    }
    
    // 使用飞书AI助手处理内容
    // 这里我们可以通过飞书的API触发AI助手，或者让用户手动在多维表格中使用AI助手
    
    return `今日已收集${records.length}篇新文章到飞书多维表格中，请访问表格查看并使用AI助手生成摘要。`;
  } catch (error) {
    logger.error('飞书多维表格处理失败:', error.message);
    return '内容处理失败，请查看日志';
  }
}

/**
 * 使用DIFY API处理文章内容
 * @param {Array} articles 文章列表
 * @returns {Promise<string>} 处理后的摘要内容
 */
async function processWithDify(articles) {
  try {
    // 准备发送给DIFY的内容
    const articlesText = articles.map(article => 
      `标题: ${article.title}\n作者: ${article.author}\n内容: ${article.content.substring(0, 500)}...\n\n`
    ).join('---\n\n');
    
    const response = await axios.post(
      `${config.difyApiUrl}/completion-messages`, 
      {
        inputs: {},
        query: `请对以下微信公众号文章进行摘要和整合，生成一篇每日简报:\n\n${articlesText}`,
        response_mode: "blocking"
      },
      {
        headers: {
          'Authorization': `Bearer ${config.difyApiKey}`,
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
 * 发送内容到飞书
 * @param {string} content 要发送的内容
 * @returns {Promise<void>}
 */
async function sendToFeishu(content) {
  try {
    const today = new Date().toLocaleDateString('zh-CN');
    
    // 构建飞书卡片消息
    const messageContent = {
      msg_type: "interactive",
      content: JSON.stringify({
        config: {
          wide_screen_mode: true
        },
        header: {
          template: "blue",
          title: {
            content: `每日资讯简报 - ${today}`,
            tag: "plain_text"
          }
        },
        elements: [
          {
            tag: "div",
            text: {
              content: content,
              tag: "lark_md"
            }
          },
          {
            tag: "hr"
          },
          {
            tag: "note",
            elements: [
              {
                content: "由WeWe RSS自动推送",
                tag: "plain_text"
              }
            ]
          }
        ]
      })
    };

    // 发送到飞书
    await axios.post(config.feishuWebhookUrl, messageContent);
    
    logger.info('成功发送到飞书');
  } catch (error) {
    logger.error('发送到飞书失败:', error.message);
    logger.error('错误详情:', error.response ? error.response.data : error);
  }
}

/**
 * 触发WeWeRSS更新源
 * @returns {Promise<boolean>} 是否成功触发更新
 */
async function triggerWeWeRssUpdate() {
  try {
    logger.info(`开始触发WeWeRSS更新源 ${config.weweRssUrl}/dash/feeds...`);
    
    // 检查URL是否有效
    if (!config.weweRssUrl || typeof config.weweRssUrl !== 'string') {
      logger.error('无效的WeWeRSS URL');
      return false;
    }
    
    // 触发更新
    try {
      const response = await axios.get(`${config.weweRssUrl}/dash/feeds`, { timeout: 30000 }); // 30秒超时
      
      if (response.status === 200) {
        logger.info('成功触发WeWeRSS更新源');
        return true;
      } else {
        logger.error(`触发WeWeRSS更新源失败: 状态码 ${response.status}`);
        return false;
      }
    } catch (error) {
      logger.error(`触发WeWeRSS更新源失败: ${error.message}`);
      if (error.response) {
        logger.error(`状态码: ${error.response.status}`);
      }
      return false;
    }
  } catch (error) {
    logger.error(`触发WeWeRSS更新源出错: ${error.message}`);
    return false;
  }
}

/**
 * 主函数
 */
async function main() {
  try {
    logger.info('开始执行微信公众号文章处理...');
    
    // 显示广告过滤配置
    if (config.enableAdFilter) {
      logger.info(`已启用广告过滤，共配置了${config.adKeywords.length}个关键词`);
    } else {
      logger.info('未启用广告过滤');
    }
    
    // 显示已发送文章过滤配置
    if (config.enableSentFilter) {
      logger.info('已启用已发送文章过滤，将避免重复发送');
    } else {
      logger.info('未启用已发送文章过滤');
    }
    
    // 先触发WeWeRSS更新源
    await triggerWeWeRssUpdate();
    
    // 等待10秒，确保更新完成
    logger.info('等待10秒，确保RSS源更新完成...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // 获取所有文章
    const articles = await fetchArticlesFromAllAtom();
    
    if (!Array.isArray(articles)) {
      logger.error('获取文章失败: 返回的不是数组');
      return;
    }
    
    // 过滤最近的文章
    const recentArticles = filterRecentArticles(articles);
    logger.info(`过滤后得到${recentArticles.length}篇最近的文章`);
    
    if (recentArticles.length === 0) {
      logger.info('没有新文章，程序结束');
      return;
    }
    
    // 过滤掉广告标题的文章
    const nonAdArticles = recentArticles.filter(article => {
      const isAd = isAdvertisementTitle(article.title);
      if (isAd) {
        logger.info(`过滤广告文章: ${article.title}`);
      }
      return !isAd;
    });
    logger.info(`过滤广告后剩余${nonAdArticles.length}篇文章（过滤掉${recentArticles.length - nonAdArticles.length}篇广告）`);
    
    // 过滤掉已发送过的文章
    let filteredArticles = nonAdArticles;
    if (config.enableSentFilter) {
      filteredArticles = await sentArticlesTracker.filterSentArticles(nonAdArticles);
      logger.info(`过滤已发送文章后剩余${filteredArticles.length}篇文章（过滤掉${nonAdArticles.length - filteredArticles.length}篇已发送）`);
    }
    
    // 如果是快速测试模式，只处理指定数量的文章
    let articlesToProcess = filteredArticles;
    if (config.quickTestMode) {
      const count = Math.min(config.quickTestArticleCount, filteredArticles.length);
      articlesToProcess = filteredArticles.slice(0, count);
      logger.info(`快速测试模式：只处理前${count}篇文章`);
    }
    
    // 处理文章并保存到每日MD文件
    if (config.saveToDailyMd) {
      logger.info('开始处理文章并保存到每日MD文件...');
      const result = await articleProcessor.processArticlesBatch(articlesToProcess, config);
      logger.info(result);
    }
    
    // 推送到飞书多维表格（如果配置了）
    if (config.pushToFeishu) {
      if (!config.feishuWebhookUrl) {
        logger.error('未配置有效的飞书Webhook URL，无法推送到飞书多维表格');
        return;
      }
      
      logger.info('开始推送文章到飞书多维表格...');
      logger.info(`使用Webhook URL: ${config.feishuWebhookUrl}`);
      
      if (config.sendMode === 'batch') {
        // 批量发送
        try {
          const result = await sendArticlesToFeishuByWebhook(articlesToProcess, config.feishuWebhookUrl);
          logger.info(result);
          
          // 记录已发送的文章
          if (config.enableSentFilter) {
            await sentArticlesTracker.addSentArticles(articlesToProcess);
          }
          
          // 发送完所有信息后，通知可以开始每日总结（如果配置了）
          if (config.generateDailySummary && config.feishuSummaryWebhookUrl) {
            logger.info('发送通知：今日信息已发送完毕，可以开始每日总结...');
            await notifySummaryWebhook(articlesToProcess.length, config.feishuSummaryWebhookUrl);
          }
        } catch (error) {
          logger.error(`批量发送文章失败: ${error.message}`);
        }
      } else if (config.sendMode === 'schedule') {
        // 定时逐条发送
        try {
          logger.info(`开始定时发送${articlesToProcess.length}篇文章，间隔${config.articleIntervalMinutes}分钟...`);
          const result = await scheduleArticlesToFeishuByWebhook(
            articlesToProcess, 
            config.feishuWebhookUrl, 
            config.articleIntervalMinutes,
            async (allSentArticles) => {
              // 记录已发送的文章
              if (config.enableSentFilter) {
                await sentArticlesTracker.addSentArticles(allSentArticles);
                logger.info(`已记录${allSentArticles.length}篇已发送的文章`);
              }
              
              // 发送完所有信息后，通知可以开始每日总结（如果配置了）
              if (config.generateDailySummary && config.feishuSummaryWebhookUrl) {
                logger.info('发送通知：今日信息已发送完毕，可以开始每日总结...');
                logger.debug(`generateDailySummary: ${config.generateDailySummary}, feishuSummaryWebhookUrl: ${config.feishuSummaryWebhookUrl}`);
                try {
                  const summaryResult = await notifySummaryWebhook(allSentArticles.length, config.feishuSummaryWebhookUrl);
                  logger.info(summaryResult);
                } catch (summaryError) {
                  logger.error(`发送每日总结通知失败: ${summaryError.message}`);
                }
              } else {
                logger.info(`跳过发送每日总结通知: generateDailySummary=${config.generateDailySummary}, feishuSummaryWebhookUrl=${Boolean(config.feishuSummaryWebhookUrl)}`);
              }
            }
          );
          logger.info(result);
        } catch (error) {
          logger.error(`定时发送文章失败: ${error.message}`);
        }
      } else {
        logger.error(`不支持的发送模式: ${config.sendMode}`);
      }
    } else {
      logger.info('未配置推送到飞书多维表格，跳过该步骤');
    }
    
    // 推送到扣子（如果配置了）
    if (config.pushToKoozhi && config.koozhiApiKey) {
      logger.info('开始推送文章到扣子...');
      await pushArticlesToKoozhi(articlesToProcess, config);
    }
    
    logger.info('所有处理完成');
  } catch (error) {
    logger.error('程序执行出错:', error.message);
    logger.error('错误详情:', error);
  }
}

/**
 * 推送文章到扣子
 * @param {Array} articles 文章列表
 * @param {Object} config 配置对象
 * @returns {Promise<string>} 处理结果
 */
async function pushArticlesToKoozhi(articles, config) {
  try {
    logger.info(`开始推送${articles.length}篇文章到扣子...`);
    
    // 记录成功发送的文章数量
    let successCount = 0;
    
    // 逐个发送文章
    for (const article of articles) {
      try {
        // 准备发送的数据
        const payload = {
          content: `标题: ${article.title}\n作者: ${article.author || '未知'}\n来源: ${article.source || '未知'}\n发布时间: ${article.pubDate || '未知'}\n链接: ${article.link}\n\n${article.summary || '无摘要'}`,
          type: "text"
        };
        
        // 发送到扣子API
        await axios.post(
          config.koozhiApiUrl,
          payload,
          {
            headers: {
              'Authorization': `Bearer ${config.koozhiApiKey}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        successCount++;
        logger.info(`成功推送文章到扣子: ${article.title}`);
      } catch (error) {
        logger.error(`推送文章到扣子失败: ${article.title}`, error.message);
      }
    }
    
    return `成功推送了${successCount}/${articles.length}篇文章到扣子`;
  } catch (error) {
    logger.error('推送文章到扣子失败:', error.message);
    return '推送文章到扣子失败，请查看日志';
  }
}

/**
 * 通知总结webhook，告知今日信息已发送完毕
 * @param {number} articleCount 文章数量
 * @param {string} webhookUrl webhook地址
 * @param {number} [delayMinutes] 延迟发送的分钟数，默认使用配置中的summaryDelayMinutes
 * @returns {Promise<void>}
 */
async function notifySummaryWebhook(articleCount, webhookUrl, delayMinutes) {
  try {
    // 使用配置中的延迟时间，如果未提供则使用默认值
    const finalDelayMinutes = delayMinutes || config.summaryDelayMinutes || 2;
    
    // 检查参数
    if (!webhookUrl) {
      logger.error('发送总结通知失败: 未提供有效的webhook地址');
      return;
    }
    
    // 获取当前日期
    const today = new Date().toLocaleDateString('zh-CN');
    
    // 准备发送的数据
    const payload = {
      content: {
        text: `今日(${today})的${articleCount}篇文章信息已全部发送完毕，可以开始每日总结了。`
      }
    };
    
    // 记录延迟发送信息
    logger.info(`将在${finalDelayMinutes}分钟后发送总结通知...`);
    logger.debug(`总结通知Webhook URL: ${webhookUrl}`);
    logger.debug(`总结通知内容: ${payload.content.text}`);
    
    // 延迟发送
    await new Promise(resolve => setTimeout(resolve, finalDelayMinutes * 60 * 1000));
    
    // 发送到webhook
    try {
      const response = await axios.post(webhookUrl, payload);
      logger.info(`总结通知发送成功，响应状态: ${response.status}`);
      
      // 如果配置了MD转JSON webhook，在3分钟后发送
      if (config.mdToJsonWebhookUrl) {
        logger.info('将在3分钟后发送MD转JSON webhook...');
        setTimeout(async () => {
          try {
            await axios.post(config.mdToJsonWebhookUrl, {
              msg_type: "text",
              content: {
                text: "http://localhost:4000/convert"
              }
            });
            logger.info('MD转JSON webhook发送成功');
          } catch (error) {
            logger.error('发送MD转JSON webhook失败:', error.message);
          }
        }, 3 * 60 * 1000);
      }
      
      return `总结通知发送成功: ${payload.content.text}`;
    } catch (error) {
      logger.error(`总结通知发送失败: ${error.message}`);
      if (error.response) {
        logger.error(`响应状态: ${error.response.status}`);
        logger.error(`响应数据: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  } catch (error) {
    logger.error(`发送总结通知失败: ${error.message}`);
    return `发送总结通知失败: ${error.message}`;
  }
}

// 如果是通过命令行直接运行，则执行main函数
if (require.main === module) {
  // 打印环境变量信息，便于调试
  logger.info(`环境变量 SCHEDULE_TIME: ${process.env.SCHEDULE_TIME}`);
  logger.info(`环境变量 FEISHU_TABLE_SCHEDULE_TIME: ${process.env.FEISHU_TABLE_SCHEDULE_TIME}`);
  logger.info(`配置中的 scheduleTime: ${config.scheduleTime}`);
  logger.info(`环境变量 SEND_MODE: ${process.env.SEND_MODE}`);
  logger.info(`环境变量 FEISHU_TABLE_TEST_MODE: ${process.env.FEISHU_TABLE_TEST_MODE}`);
  
  // 检查是否是定时任务模式
  if (process.env.SEND_MODE === 'schedule' && process.env.FEISHU_TABLE_TEST_MODE !== 'true') {
    // 定时任务模式
    logger.info(`正在设置定时任务，将在 ${config.scheduleTime} 执行内容获取与处理`);
    
    // 设置定时任务
    const job = schedule.scheduleJob(config.scheduleTime, async () => {
      logger.info(`定时任务触发，开始执行内容获取与处理...`);
      try {
        await main();
      } catch (error) {
        logger.error('定时任务执行失败:', error.message);
        logger.error(error.stack);
      }
    });
    
    logger.info(`服务已启动，将在每天 ${config.scheduleTime} 执行内容获取与处理`);
  } else {
    // 立即执行模式
    logger.info('立即执行模式，开始处理...');
    main().catch(error => {
      logger.error('程序执行失败:', error.message);
      logger.error(error.stack);
      process.exit(1);
    });
  }
}

// 导出函数供其他模块使用
module.exports = {
  main,
  fetchArticlesFromAllAtom,
  filterRecentArticles,
  isAdvertisementTitle,
  sendToFeishu,
  pushArticlesToKoozhi,
  triggerWeWeRssUpdate
}; 