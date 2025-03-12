import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { AppService } from './app.service';
import axios from 'axios';
import * as dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

/**
 * Python API控制器
 * 提供给Python服务调用的API接口
 */
@Controller('api/python')
export class PythonApiController {
  constructor(private readonly appService: AppService) {}

  /**
   * 验证授权码
   * @param authCode 授权码
   * @returns 如果授权码有效，返回true；否则抛出异常
   */
  private validateAuthCode(authCode: string): boolean {
    const configAuthCode = process.env.AUTH_CODE;
    
    // 如果未配置授权码，则不进行验证
    if (!configAuthCode) {
      return true;
    }
    
    // 验证授权码
    if (authCode !== configAuthCode) {
      throw new HttpException('授权码无效', HttpStatus.UNAUTHORIZED);
    }
    
    return true;
  }

  /**
   * 发送文章到飞书
   * @param body 请求体，包含授权码
   * @returns 处理结果
   */
  @Post('send-articles')
  async sendArticlesToFeishu(@Body() body: { auth_code: string }) {
    try {
      // 验证授权码
      this.validateAuthCode(body.auth_code);
      
      // 调用webhook-processor.js中的函数发送文章到飞书
      // 这里需要导入webhook-processor.js中的函数
      // 由于这是TypeScript文件，我们可以通过require动态导入
      const webhookProcessor = require('../../../src/webhook-processor');
      
      // 获取文章列表
      // 这里需要从WeWe RSS获取文章列表
      // 可以通过调用index.js中的函数获取
      const indexModule = require('../../../src/index');
      
      // 获取文章列表
      const articles = await indexModule.fetchArticlesFromAllAtom();
      
      // 过滤最近的文章
      const recentArticles = indexModule.filterRecentArticles(articles);
      
      // 发送文章到飞书
      const result = await webhookProcessor.sendArticlesToFeishuByWebhook(recentArticles);
      
      return {
        success: true,
        message: '成功发送文章到飞书',
        result
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: '发送文章失败',
          error: error.message
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * 发送每日摘要到飞书
   * @param body 请求体，包含授权码和摘要内容
   * @returns 处理结果
   */
  @Post('send-summary')
  async sendDailySummary(@Body() body: { auth_code: string; summary: string }) {
    try {
      // 验证授权码
      this.validateAuthCode(body.auth_code);
      
      // 验证摘要内容
      if (!body.summary) {
        throw new HttpException('摘要内容不能为空', HttpStatus.BAD_REQUEST);
      }
      
      // 调用webhook-processor.js中的函数发送每日摘要到飞书
      const webhookProcessor = require('../../../src/webhook-processor');
      
      // 发送每日摘要到飞书
      const result = await webhookProcessor.sendDailySummaryByWebhook(body.summary);
      
      return {
        success: true,
        message: '成功发送每日摘要到飞书',
        result
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: '发送每日摘要失败',
          error: error.message
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
} 