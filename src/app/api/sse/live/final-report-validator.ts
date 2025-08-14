/**
 * Final Report 完整性验证器
 * 验证缓存的final-report是否符合质量标准
 */

export interface FinalReportValidationResult {
  isValid: boolean;
  reason?: string;
  metrics: {
    contentLength: number;
    linkCount: number;
    imageCount: number;
    hasFinalReportTag: boolean;
  };
}

export class FinalReportValidator {
  /**
   * 验证final-report的完整性
   * 要求：
   * 1. 包含完整的<final-report>标签块
   * 2. 标签块内容长度超过12000字符
   * 3. 包含至少2个链接
   * 4. 包含至少1个图片地址
   */
  static validateFinalReport(taskOutputs: any): FinalReportValidationResult {
    // 解析outputs数据
    let outputs: any = {};
    try {
      if (typeof taskOutputs === 'string') {
        outputs = JSON.parse(taskOutputs);
      } else {
        outputs = taskOutputs || {};
      }
    } catch {
      return {
        isValid: false,
        reason: 'Invalid outputs JSON format',
        metrics: {
          contentLength: 0,
          linkCount: 0,
          imageCount: 0,
          hasFinalReportTag: false
        }
      };
    }

    // 检查是否有finalReport字段
    const finalReport = outputs.finalReport || outputs['final-report'] || '';
    if (!finalReport || typeof finalReport !== 'string') {
      return {
        isValid: false,
        reason: 'No final report content found',
        metrics: {
          contentLength: 0,
          linkCount: 0,
          imageCount: 0,
          hasFinalReportTag: false
        }
      };
    }

    // 1. 检查是否包含<final-report>标签块
    const finalReportTagMatch = finalReport.match(/<final-report>([\s\S]*?)<\/final-report>/i);
    const hasFinalReportTag = !!finalReportTagMatch;
    
    // 提取标签内容，如果没有标签则使用全部内容
    const reportContent = hasFinalReportTag ? finalReportTagMatch[1] : finalReport;
    
    // 2. 检查内容长度（至少12000字符）
    const contentLength = reportContent.trim().length;
    const minContentLength = 12000;
    
    // 3. 检查链接数量（至少2个）
    const linkRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
    const linkMatches = reportContent.match(linkRegex) || [];
    const linkCount = linkMatches.length;
    const minLinkCount = 2;
    
    // 4. 检查图片地址数量（至少1个）
    const imageRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]*\.(jpg|jpeg|png|gif|webp|svg)(\?[^\s<>"{}|\\^`\[\]]*)?/gi;
    const imageMatches = reportContent.match(imageRegex) || [];
    const imageCount = imageMatches.length;
    const minImageCount = 1;
    
    const metrics = {
      contentLength,
      linkCount,
      imageCount,
      hasFinalReportTag
    };

    // 验证所有条件
    const validations = [
      {
        condition: hasFinalReportTag,
        message: 'Missing <final-report> XML tag block'
      },
      {
        condition: contentLength >= minContentLength,
        message: `Content too short: ${contentLength} < ${minContentLength} characters`
      },
      {
        condition: linkCount >= minLinkCount,
        message: `Insufficient links: ${linkCount} < ${minLinkCount} links`
      },
      {
        condition: imageCount >= minImageCount,
        message: `Insufficient images: ${imageCount} < ${minImageCount} images`
      }
    ];

    const failedValidation = validations.find(v => !v.condition);
    
    if (failedValidation) {
      return {
        isValid: false,
        reason: failedValidation.message,
        metrics
      };
    }

    // 所有验证都通过
    return {
      isValid: true,
      metrics
    };
  }

  /**
   * 验证任务是否具有有效的缓存
   * 检查任务状态和final-report完整性
   */
  static validateTaskCache(task: any): FinalReportValidationResult {
    // 检查任务基本状态
    if (!task) {
      return {
        isValid: false,
        reason: 'Task not found',
        metrics: {
          contentLength: 0,
          linkCount: 0,
          imageCount: 0,
          hasFinalReportTag: false
        }
      };
    }

    // 检查任务是否已完成
    if (task.status !== 'completed') {
      return {
        isValid: false,
        reason: `Task not completed, current status: ${task.status}`,
        metrics: {
          contentLength: 0,
          linkCount: 0,
          imageCount: 0,
          hasFinalReportTag: false
        }
      };
    }

    // 检查是否有输出数据
    const outputs = task.outputs || task.result;
    if (!outputs) {
      return {
        isValid: false,
        reason: 'No task outputs found',
        metrics: {
          contentLength: 0,
          linkCount: 0,
          imageCount: 0,
          hasFinalReportTag: false
        }
      };
    }

    // 验证final-report内容
    return this.validateFinalReport(outputs);
  }

  /**
   * 生成验证结果的用户友好消息
   */
  static getValidationMessage(result: FinalReportValidationResult): string {
    if (result.isValid) {
      return `Valid final report cache (${result.metrics.contentLength} chars, ${result.metrics.linkCount} links, ${result.metrics.imageCount} images)`;
    }

    return `Invalid cache: ${result.reason} - Content: ${result.metrics.contentLength} chars, Links: ${result.metrics.linkCount}, Images: ${result.metrics.imageCount}`;
  }
}