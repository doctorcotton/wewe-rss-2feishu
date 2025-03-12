/**
 * 飞书多维表格AI处理模块
 * 用于在飞书多维表格中使用AI能力处理文章内容
 */

const axios = require('axios');
const logger = require('./logger');

/**
 * 使用飞书多维表格的AI能力处理文章
 * @param {string} accessToken 飞书访问令牌
 * @param {string} appToken 飞书多维表格AppToken
 * @param {string} tableId 表格ID
 * @param {Array} recordIds 需要处理的记录ID列表
 * @returns {Promise<string>} 处理结果
 */
async function processWithFeishuAI(accessToken, appToken, tableId, recordIds) {
  try {
    // 1. 获取表格视图信息
    const viewResponse = await axios.get(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/views`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const viewId = viewResponse.data.data.items[0].view_id;
    
    // 2. 使用飞书AI助手生成摘要
    // 注意：这里使用的是飞书多维表格的AI能力API，需要根据实际情况调整
    const aiResponse = await axios.post(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_update`,
      {
        records: recordIds.map(recordId => ({
          record_id: recordId,
          fields: {
            '摘要': {
              text: `{{AI助手:请根据"内容"字段，生成一个简洁的摘要，不超过200字}}`,
              type: 'formula'
            },
            '处理状态': '已处理'
          }
        }))
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return `成功使用飞书AI处理了${recordIds.length}篇文章`;
  } catch (error) {
    logger.error('飞书AI处理失败:', error.message);
    throw error;
  }
}

/**
 * 生成每日摘要报告
 * @param {string} accessToken 飞书访问令牌
 * @param {string} appToken 飞书多维表格AppToken
 * @param {string} tableId 表格ID
 * @returns {Promise<string>} 每日摘要报告
 */
async function generateDailySummary(accessToken, appToken, tableId) {
  try {
    // 获取今天的日期
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const todayStr = today.toISOString().split('T')[0];
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    // 查询最近24小时处理过的文章
    const response = await axios.get(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
      {
        params: {
          filter: `AND(CurrentValue.[处理状态] = "已处理", CurrentValue.[发布日期] >= "${yesterdayStr}T00:00:00Z", CurrentValue.[发布日期] <= "${todayStr}T23:59:59Z")`
        },
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const records = response.data.data.items || [];
    
    if (records.length === 0) {
      return '今日没有新的文章摘要';
    }
    
    // 生成摘要报告
    let summary = `# 每日资讯摘要 (${todayStr})\n\n`;
    
    records.forEach((record, index) => {
      const fields = record.fields;
      summary += `## ${index + 1}. ${fields['标题']}\n`;
      summary += `- 来源: ${fields['来源']}\n`;
      summary += `- 作者: ${fields['作者']}\n\n`;
      summary += `${fields['摘要']}\n\n`;
      summary += `[阅读原文](${fields['链接']})\n\n`;
      summary += `---\n\n`;
    });
    
    return summary;
  } catch (error) {
    logger.error('生成每日摘要报告失败:', error.message);
    return '生成每日摘要报告失败，请查看日志';
  }
}

module.exports = {
  processWithFeishuAI,
  generateDailySummary
}; 