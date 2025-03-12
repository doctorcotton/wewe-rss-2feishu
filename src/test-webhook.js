/**
 * 飞书多维表格Webhook测试脚本
 * @author 您的名字
 * @date 创建日期
 */

require('dotenv').config();
const axios = require('axios');
const logger = require('./logger');

// 从环境变量获取webhook URL
const webhookUrl = process.env.FEISHU_WEBHOOK_URL || 'https://k11pnjpvz1.feishu.cn/base/workflow/webhook/event/BOOyaX313wU1zlhXCX7cW4gknsb';

/**
 * 测试向飞书多维表格发送单条记录
 */
async function testSendSingleRecord() {
  try {
    logger.info('正在测试向飞书多维表格发送单条记录...');
    logger.info(`使用的Webhook URL: ${webhookUrl}`);
    
    // 准备测试数据
    const testData = {
      records: [
        {
          fields: {
            "标题": "测试文章 - " + new Date().toLocaleString(),
            "链接": "https://example.com/test",
            "发布日期": new Date().toISOString(),
            "作者": "测试作者",
            "来源": "测试来源"
          }
        }
      ]
    };
    
    // 发送请求
    const response = await axios.post(webhookUrl, testData);
    
    // 输出结果
    logger.info('请求成功，响应状态码:', response.status);
    logger.info('响应数据:', JSON.stringify(response.data, null, 2));
    logger.info('测试完成！');
  } catch (error) {
    logger.error('测试失败:', error.message);
    if (error.response) {
      logger.error('错误状态码:', error.response.status);
      logger.error('错误响应数据:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

/**
 * 测试向飞书发送卡片消息
 */
async function testSendCardMessage() {
  try {
    logger.info('正在测试向飞书发送卡片消息...');
    logger.info(`使用的Webhook URL: ${webhookUrl}`);
    
    // 准备测试数据 - 飞书机器人卡片消息
    const testData = {
      msg_type: "interactive",
      card: {
        header: {
          title: {
            tag: "plain_text",
            content: "测试卡片消息 - " + new Date().toLocaleString()
          },
          template: "blue"
        },
        elements: [
          {
            tag: "div",
            text: {
              tag: "lark_md",
              content: "这是一条测试消息，用于验证webhook是否正常工作。\n\n**粗体文本**\n*斜体文本*\n[链接文本](https://example.com)"
            }
          },
          {
            tag: "hr"
          },
          {
            tag: "note",
            elements: [
              {
                tag: "plain_text",
                content: "由测试脚本自动发送"
              }
            ]
          }
        ]
      }
    };
    
    // 发送请求
    const response = await axios.post(webhookUrl, testData);
    
    // 输出结果
    logger.info('请求成功，响应状态码:', response.status);
    logger.info('响应数据:', JSON.stringify(response.data, null, 2));
    logger.info('测试完成！');
  } catch (error) {
    logger.error('测试失败:', error.message);
    if (error.response) {
      logger.error('错误状态码:', error.response.status);
      logger.error('错误响应数据:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// 执行测试
async function runTests() {
  // 测试向飞书多维表格发送单条记录
  await testSendSingleRecord();
  logger.info('\n-----------------------------------\n');
  
  // 测试向飞书发送卡片消息
  await testSendCardMessage();
}

runTests(); 