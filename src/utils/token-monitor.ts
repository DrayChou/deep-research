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

    // 3. 检查finish_reason异常
    if (config.finishReason === 'unknown' || config.finishReason === 'length') {
      issues.push(`Finish reason: ${config.finishReason} - indicates potential truncation`);
      if (config.finishReason === 'length') {
        recommendations.push('Output was truncated due to token limit - consider using model with higher output capacity');
      } else {
        recommendations.push('Unexpected termination - check AI provider status and model availability');
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
    if (analysis.utilization.contextWindow > 95 || 
        (config.finishReason === 'unknown' && responseLength < 1000)) {
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
        successfulRequests: configs.filter(c => c.finishReason === 'stop').length,
        truncatedRequests: configs.filter(c => c.finishReason === 'unknown' || c.finishReason === 'length').length,
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
        c.operation === operation && c.finishReason === 'stop'
      ).length / opData.requests) * 100);
    });

    return report;
  }
}

export const tokenMonitor = TokenMonitor.getInstance();
export default TokenMonitor;