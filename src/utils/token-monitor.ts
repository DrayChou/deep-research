/**
 * Token监控和分析工具
 * 专门用于监控AI模型的Token使用情况和识别截断问题
 */

import { getTokenUsageAnalysis } from './model-limits';
import { logger } from './logger';

interface TokenMonitorConfig {
  modelName: string;
  operation: string;
  promptText: string;
  responseText?: string;
  finishReason?: string;
  usage?: {
    promptTokens?: number | null;
    completionTokens?: number | null;
    totalTokens?: number | null;
  };
}

class TokenMonitor {
  private static instance: TokenMonitor;
  private logger: any;

  constructor() {
    this.logger = logger.getInstance('Token-Monitor');
  }

  static getInstance(): TokenMonitor {
    if (!TokenMonitor.instance) {
      TokenMonitor.instance = new TokenMonitor();
    }
    return TokenMonitor.instance;
  }

  /**
   * 监控AI请求的Token使用情况
   */
  monitorAIRequest(config: TokenMonitorConfig) {
    const analysis = getTokenUsageAnalysis(
      config.modelName,
      config.usage?.promptTokens || null,
      config.usage?.completionTokens || null,
      config.promptText
    );

    // 记录详细的Token分析
    this.logger.info(`Token Analysis for ${config.operation}`, {
      model: config.modelName,
      operation: config.operation,
      limits: analysis.limits,
      usage: analysis.usage,
      utilization: analysis.utilization,
      warnings: analysis.warnings,
      responseInfo: {
        finishReason: config.finishReason,
        responseLength: config.responseText?.length || 0,
        responsePreview: config.responseText?.substring(0, 100) || 'N/A'
      }
    }, true);

    // 检查潜在问题并发出警告
    this.checkForTokenIssues(config, analysis);

    return analysis;
  }

  /**
   * 检查Token相关的潜在问题
   */
  private checkForTokenIssues(config: TokenMonitorConfig, analysis: any) {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // 1. 检查上下文窗口使用率
    if (analysis.utilization.contextWindow > 90) {
      issues.push(`Context window utilization is ${analysis.utilization.contextWindow}% - very high`);
      recommendations.push('Consider reducing input content length or using a model with larger context window');
    } else if (analysis.utilization.contextWindow > 80) {
      issues.push(`Context window utilization is ${analysis.utilization.contextWindow}% - approaching limit`);
      recommendations.push('Monitor for potential truncation issues');
    }

    // 2. 检查输出Token使用率
    if (analysis.utilization.outputTokens > 95) {
      issues.push(`Output token utilization is ${analysis.utilization.outputTokens}% - likely truncated`);
      recommendations.push('Use a model with higher output token limit or split the task');
    }

    // 3. 检查finish_reason异常 - 扩展覆盖所有需要重试的finishReason
    const problematicReasons: Record<string, string> = {
      // 高优先级：必须重试
      'unknown': 'Unexpected model termination - indicates AI service issue',
      'error': 'Model encountered an error during generation',
      'length': 'Output truncated due to token limit',
      'max_tokens': 'Anthropic: Output truncated due to token limit',
      'MAX_TOKENS': 'Google Gemini: Output truncated due to token limit',
      'FINISH_REASON_UNSPECIFIED': 'Google Gemini: Unspecified finish reason',
      'OTHER': 'Google Gemini: Other unspecified issue',
      
      // 中优先级：条件重试
      'content-filter': 'OpenAI: Content blocked by safety filter',
      'content_filter': 'OpenAI/Azure: Content blocked by safety filter',
      'SAFETY': 'Google Gemini: Content blocked by safety filter',
      'PROHIBITED_CONTENT': 'Google Gemini: Prohibited content detected',
      'RECITATION': 'Google Gemini: Content flagged for potential copyright issues',
      'BLOCKLIST': 'Google Gemini: Content matches blocklist',
      'SPII': 'Google Gemini: Sensitive personal information detected',
      'refusal': 'Anthropic: Model refused to generate content'
    };
    
    if (config.finishReason && problematicReasons[config.finishReason]) {
      const description = problematicReasons[config.finishReason];
      issues.push(`Finish reason: ${config.finishReason} - ${description}`);
      
      // 根据不同类型提供针对性建议
      if (['length', 'max_tokens', 'MAX_TOKENS'].includes(config.finishReason)) {
        recommendations.push('Increase max_tokens parameter or use model with higher token limit');
        recommendations.push('Consider splitting the task into smaller parts');
      } else if (['unknown', 'error', 'OTHER', 'FINISH_REASON_UNSPECIFIED'].includes(config.finishReason)) {
        recommendations.push('Retry with exponential backoff - likely transient AI service issue');
        recommendations.push('Check AI provider status and model availability');
        recommendations.push('Consider using backup AI provider if issue persists');
      } else if (['content-filter', 'content_filter', 'SAFETY', 'PROHIBITED_CONTENT', 'refusal'].includes(config.finishReason)) {
        recommendations.push('Adjust prompt to comply with content policy');
        recommendations.push('Use more educational/factual language');
        recommendations.push('Retry once with modified prompt');
      } else if (['RECITATION', 'BLOCKLIST', 'SPII'].includes(config.finishReason)) {
        recommendations.push('Avoid direct quotes and sensitive information');
        recommendations.push('Use paraphrasing and general terminology');
        recommendations.push('Retry with content modifications');
      }
    }

    // 4. 检查响应长度异常
    const responseLength = config.responseText?.length || 0;
    if (responseLength < 1000 && config.operation === 'writeFinalReport') {
      issues.push(`Response suspiciously short for ${config.operation}: ${responseLength} characters`);
      recommendations.push('Verify AI response completeness and check for early termination');
    }

    // 5. 检查Token数据缺失
    if (!config.usage?.promptTokens && !config.usage?.completionTokens) {
      issues.push('Token usage data not available from AI provider');
      recommendations.push('Consider using provider that returns detailed token usage information');
    }

    // 如果发现问题，发出警告
    if (issues.length > 0) {
      this.logger.warn(`Token Issues Detected in ${config.operation}`, {
        model: config.modelName,
        operation: config.operation,
        issues,
        recommendations,
        tokenAnalysis: {
          contextUtilization: analysis.utilization.contextWindow + '%',
          outputUtilization: analysis.utilization.outputTokens + '%',
          estimatedPromptTokens: analysis.usage.estimatedPromptTokens,
          actualTokens: analysis.usage
        },
        responseInfo: {
          finishReason: config.finishReason,
          responseLength: responseLength,
          expectedMinimum: config.operation === 'writeFinalReport' ? 5000 : 500
        }
      }, true);
    }

    // 如果是严重问题，发出错误级日志
    const criticalFinishReasons = ['unknown', 'error', 'FINISH_REASON_UNSPECIFIED'];
    const isCriticalFinishReason = config.finishReason && criticalFinishReasons.includes(config.finishReason);
    
    if (analysis.utilization.contextWindow > 95 || 
        (isCriticalFinishReason && responseLength < 1000) ||
        (['length', 'max_tokens', 'MAX_TOKENS'].includes(config.finishReason || '') && responseLength < 500)) {
      this.logger.error(`Critical Token Issue in ${config.operation}`, {
        model: config.modelName,
        operation: config.operation,
        criticalIssues: issues.filter(issue => 
          issue.includes('very high') || 
          issue.includes('truncated') || 
          issue.includes('unknown')
        ),
        urgentRecommendations: recommendations,
        tokenAnalysis: analysis,
        responseInfo: {
          finishReason: config.finishReason,
          responseLength: responseLength
        }
      }, true);
    }
  }

  /**
   * 生成Token使用报告
   */
  generateTokenReport(configs: TokenMonitorConfig[]): any {
    const report = {
      summary: {
        totalRequests: configs.length,
        successfulRequests: configs.filter(c => ['stop', 'end_turn', 'tool_calls', 'function_call', 'pause_turn'].includes(c.finishReason || '')).length,
        truncatedRequests: configs.filter(c => {
          const reason = c.finishReason || '';
          return ['unknown', 'error', 'length', 'max_tokens', 'MAX_TOKENS', 'OTHER', 'FINISH_REASON_UNSPECIFIED'].includes(reason);
        }).length,
        highUtilizationRequests: 0
      },
      models: {} as any,
      operations: {} as any,
      recommendations: [] as string[]
    };

    configs.forEach(config => {
      const analysis = getTokenUsageAnalysis(
        config.modelName,
        config.usage?.promptTokens || null,
        config.usage?.completionTokens || null,
        config.promptText
      );

      // 统计模型使用情况
      if (!report.models[config.modelName]) {
        report.models[config.modelName] = {
          requests: 0,
          avgContextUtilization: 0,
          avgOutputUtilization: 0,
          issues: 0
        };
      }
      report.models[config.modelName].requests++;
      report.models[config.modelName].avgContextUtilization += analysis.utilization.contextWindow;
      report.models[config.modelName].avgOutputUtilization += analysis.utilization.outputTokens;

      // 统计操作使用情况
      if (!report.operations[config.operation]) {
        report.operations[config.operation] = {
          requests: 0,
          avgResponseLength: 0,
          successRate: 0
        };
      }
      report.operations[config.operation].requests++;
      report.operations[config.operation].avgResponseLength += config.responseText?.length || 0;

      // 统计高使用率请求
      if (analysis.utilization.contextWindow > 80) {
        report.summary.highUtilizationRequests++;
      }
    });

    // 计算平均值
    Object.keys(report.models).forEach(model => {
      const modelData = report.models[model];
      modelData.avgContextUtilization = Math.round(modelData.avgContextUtilization / modelData.requests);
      modelData.avgOutputUtilization = Math.round(modelData.avgOutputUtilization / modelData.requests);
    });

    Object.keys(report.operations).forEach(operation => {
      const opData = report.operations[operation];
      opData.avgResponseLength = Math.round(opData.avgResponseLength / opData.requests);
      opData.successRate = Math.round((configs.filter(c => 
        c.operation === operation && ['stop', 'end_turn', 'tool_calls', 'function_call', 'pause_turn'].includes(c.finishReason || '')
      ).length / opData.requests) * 100);
    });

    return report;
  }
}

export const tokenMonitor = TokenMonitor.getInstance();
export default TokenMonitor;