/**
 * 严格的质量验证器
 * 绝不降低阈值，确保报告质量
 */

import { Logger } from "@/utils/logger";

const logger = Logger.getInstance('Quality-Validator');

export interface QualityValidationResult {
  valid: boolean;
  error?: string;
  metrics: {
    contentLength: number;
    actualMinLength: number;
    hasSubstantialContent: boolean;
    finishReason?: string;
  };
}

export interface QualityRequirement {
  minLength: number;
  operation: string;
  requireCompleteOutput: boolean; // 是否要求完整输出
}

/**
 * 严格的质量验证器
 * 原则：宁愿失败也不降低质量标准
 */
export class StrictQualityValidator {
  
  /**
   * 验证报告计划质量
   */
  static validateReportPlan(
    content: string, 
    finishReason?: string,
    attempt?: number
  ): QualityValidationResult {
    const requirement: QualityRequirement = {
      minLength: 50, // 绝不降低
      operation: 'writeReportPlan',
      requireCompleteOutput: true
    };

    return this.validateContent(content, requirement, finishReason, attempt);
  }

  /**
   * 验证最终报告质量
   */
  static validateFinalReport(
    content: string, 
    finishReason?: string,
    attempt?: number
  ): QualityValidationResult {
    const requirement: QualityRequirement = {
      minLength: 500, // 绝不降低
      operation: 'writeFinalReport', 
      requireCompleteOutput: true
    };

    return this.validateContent(content, requirement, finishReason, attempt);
  }

  /**
   * 验证SERP查询结果
   */
  static validateSerpQueries(
    queries: any[],
    finishReason?: string
  ): QualityValidationResult {
    const isValid = Array.isArray(queries) && 
                   queries.length > 0 && 
                   queries.every(q => q.query && q.query.trim().length > 0);
    
    // unknown finishReason对于结构化数据同样不可接受
    if (finishReason === 'unknown') {
      return {
        valid: false,
        error: `Unknown finish reason indicates incomplete JSON generation. Queries may be truncated.`,
        metrics: {
          contentLength: queries.length,
          actualMinLength: 1,
          hasSubstantialContent: isValid,
          finishReason
        }
      };
    }

    return {
      valid: isValid,
      error: isValid ? undefined : `Invalid SERP queries: expected non-empty array with valid query objects`,
      metrics: {
        contentLength: queries.length,
        actualMinLength: 1,
        hasSubstantialContent: isValid,
        finishReason
      }
    };
  }

  /**
   * 核心验证逻辑
   */
  private static validateContent(
    content: string,
    requirement: QualityRequirement,
    finishReason?: string,
    attempt?: number
  ): QualityValidationResult {
    const trimmedContent = content?.trim() || '';
    const contentLength = trimmedContent.length;
    
    const metrics = {
      contentLength,
      actualMinLength: requirement.minLength,
      hasSubstantialContent: contentLength >= requirement.minLength,
      finishReason
    };

    // 1. 检查 finishReason - unknown 绝不接受
    if (finishReason === 'unknown') {
      const error = `Unknown finish reason indicates incomplete ${requirement.operation}. ` +
                   `Content may be truncated at ${contentLength} characters. ` +
                   `Cannot guarantee report completeness - requiring retry.`;
      
      logger.warn('Quality validation failed: unknown finish reason', {
        operation: requirement.operation,
        contentLength,
        requiredLength: requirement.minLength,
        finishReason,
        attempt,
        errorReason: 'incomplete_generation'
      });

      return { valid: false, error, metrics };
    }

    // 2. 检查内容长度 - 严格要求，不允许降低
    if (contentLength < requirement.minLength) {
      const error = `${requirement.operation} content too short: ${contentLength} < ${requirement.minLength} characters. ` +
                   `Quality standards must be maintained - no exceptions.`;

      logger.warn('Quality validation failed: insufficient content', {
        operation: requirement.operation,
        contentLength,
        requiredLength: requirement.minLength,
        finishReason,
        attempt,
        errorReason: 'insufficient_content'
      });

      return { valid: false, error, metrics };
    }

    // 3. 检查其他异常的 finishReason
    const problematicReasons = ['error', 'blocked', 'content_filter'];
    if (finishReason && problematicReasons.includes(finishReason)) {
      const error = `${requirement.operation} generation failed with reason: ${finishReason}. ` +
                   `This indicates a fundamental issue that requires retry.`;

      logger.warn('Quality validation failed: problematic finish reason', {
        operation: requirement.operation,
        contentLength,
        finishReason,
        attempt,
        errorReason: 'problematic_finish_reason'
      });

      return { valid: false, error, metrics };
    }

    // 4. 通过所有检查
    logger.debug('Quality validation passed', {
      operation: requirement.operation,
      contentLength,
      requiredLength: requirement.minLength,
      finishReason,
      attempt,
      qualityScore: contentLength / requirement.minLength
    });

    return { valid: true, metrics };
  }

  /**
   * 检查是否应该继续重试
   */
  static shouldContinueRetry(
    validationResult: QualityValidationResult,
    currentAttempt: number,
    maxAttempts: number
  ): boolean {
    if (validationResult.valid) {
      return false; // 已经成功，不需要重试
    }

    if (currentAttempt >= maxAttempts) {
      return false; // 已达到最大重试次数
    }

    // 对于质量问题，总是应该重试（直到所有模型都试过）
    return true;
  }

  /**
   * 生成用户友好的错误消息
   */
  static generateUserErrorMessage(
    operation: string,
    totalAttempts: number,
    lastValidationResult?: QualityValidationResult
  ): string {
    const baseMessage = `${operation} generation failed after ${totalAttempts} attempts with all available models.`;
    
    if (!lastValidationResult) {
      return `${baseMessage} Please try again.`;
    }

    const { metrics } = lastValidationResult;
    
    if (metrics.finishReason === 'unknown') {
      return `${baseMessage} The AI models encountered completion issues and couldn't generate complete content. This may be due to model service instability. Please retry your request.`;
    }

    if (metrics.contentLength < metrics.actualMinLength) {
      return `${baseMessage} The generated content was too short (${metrics.contentLength} chars, required: ${metrics.actualMinLength}). This may indicate the query needs to be more specific or the topic requires different models. Please refine your request and try again.`;
    }

    return `${baseMessage} Quality requirements could not be met. Please try again or contact support if the issue persists.`;
  }
}