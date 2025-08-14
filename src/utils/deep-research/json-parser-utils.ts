/**
 * JSON 解析工具 - 处理 AI 返回的各种格式
 * 特别处理 markdown 包裹、前后特殊字符等情况
 */

import { Logger } from "@/utils/logger";

const logger = Logger.getInstance('JSON-Parser');

export interface JsonParseResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  originalContent?: string;
  cleanedContent?: string;
  appliedFixes?: string[];
}

/**
 * 强化的 JSON 解析器，专门处理 AI 返回的不规范格式
 */
export class RobustJsonParser {
  private static readonly JSON_EXTRACTION_PATTERNS = [
    // 匹配完整的对象或数组，包括嵌套
    /(\{[\s\S]*\})/,
    /(\[[\s\S]*\])/,
    // 匹配 markdown 代码块中的 JSON
    /```(?:json|javascript|js)?\s*(\{[\s\S]*?\})\s*```/i,
    /```(?:json|javascript|js)?\s*(\[[\s\S]*?\])\s*```/i,
    // 匹配简单的键值对格式
    /^\s*\{[\s\S]*\}\s*$/,
    /^\s*\[[\s\S]*\]\s*$/
  ];

  /**
   * 主解析方法
   */
  static parse<T = any>(content: string, operation?: string): JsonParseResult<T> {
    const startTime = Date.now();
    const context = operation ? `[${operation}]` : '';
    
    logger.debug(`${context} Starting JSON parse`, {
      contentLength: content.length,
      contentPreview: content.substring(0, 200)
    });

    // 第一步：直接尝试解析
    const directResult = this.tryDirectParse<T>(content);
    if (directResult.success) {
      logger.debug(`${context} Direct parse succeeded`, {
        duration: Date.now() - startTime
      });
      return directResult;
    }

    // 第二步：提取和清理
    const extractResult = this.extractAndParse<T>(content);
    if (extractResult.success) {
      logger.debug(`${context} Extract and parse succeeded`, {
        duration: Date.now() - startTime,
        appliedFixes: extractResult.appliedFixes
      });
      return extractResult;
    }

    // 第三步：激进修复
    const aggressiveResult = this.aggressiveRepairAndParse<T>(content);
    if (aggressiveResult.success) {
      logger.warn(`${context} Aggressive repair succeeded`, {
        duration: Date.now() - startTime,
        appliedFixes: aggressiveResult.appliedFixes,
        originalLength: content.length,
        cleanedLength: aggressiveResult.cleanedContent?.length
      });
      return aggressiveResult;
    }

    // 全部失败
    logger.error(`${context} All JSON parse attempts failed`, {
      duration: Date.now() - startTime,
      contentLength: content.length,
      contentSample: content.substring(0, 500),
      lastError: aggressiveResult.error
    });

    return {
      success: false,
      error: `Failed to parse JSON after all repair attempts: ${aggressiveResult.error}`,
      originalContent: content
    };
  }

  /**
   * 直接解析尝试
   */
  private static tryDirectParse<T>(content: string): JsonParseResult<T> {
    try {
      const trimmed = content.trim();
      const data = JSON.parse(trimmed) as T;
      return {
        success: true,
        data,
        originalContent: content,
        cleanedContent: trimmed
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown parse error',
        originalContent: content
      };
    }
  }

  /**
   * 提取和解析 - 处理 markdown 包裹等常见情况
   */
  private static extractAndParse<T>(content: string): JsonParseResult<T> {
    const appliedFixes: string[] = [];
    let bestAttempt: JsonParseResult<T> = { success: false, error: 'No extraction patterns matched' };

    for (const pattern of this.JSON_EXTRACTION_PATTERNS) {
      const match = content.match(pattern);
      if (!match) continue;

      const extracted = match[1] || match[0];
      appliedFixes.push(`Applied pattern: ${pattern.source.substring(0, 50)}...`);

      // 尝试解析提取的内容
      const parseResult = this.tryDirectParse<T>(extracted);
      if (parseResult.success) {
        return {
          ...parseResult,
          appliedFixes,
          originalContent: content
        };
      }

      // 记录最佳尝试
      if (!bestAttempt.success) {
        bestAttempt = parseResult;
      }
    }

    return {
      ...bestAttempt,
      appliedFixes
    };
  }

  /**
   * 激进修复 - 处理各种格式问题
   */
  private static aggressiveRepairAndParse<T>(content: string): JsonParseResult<T> {
    const appliedFixes: string[] = [];
    let workingContent = content;

    // 1. 基础清理
    workingContent = this.basicCleanup(workingContent, appliedFixes);

    // 2. 查找第一个大括号到最后一个大括号的内容 (你特别要求的)
    const bracketExtracted = this.extractByBrackets(workingContent, appliedFixes);
    if (bracketExtracted) {
      workingContent = bracketExtracted;
    }

    // 3. 修复常见的JSON格式问题
    workingContent = this.fixCommonJsonIssues(workingContent, appliedFixes);

    // 4. 处理特殊的AI输出格式
    workingContent = this.fixAiSpecificIssues(workingContent, appliedFixes);

    // 5. 最终解析尝试
    const parseResult = this.tryDirectParse<T>(workingContent);
    
    return {
      ...parseResult,
      appliedFixes,
      originalContent: content,
      cleanedContent: workingContent
    };
  }

  /**
   * 基础清理 - 移除明显的非JSON内容
   */
  private static basicCleanup(content: string, appliedFixes: string[]): string {
    let cleaned = content;

    // 移除HTML标签
    if (/<[^>]+>/.test(cleaned)) {
      cleaned = cleaned.replace(/<[^>]+>/g, '');
      appliedFixes.push('Removed HTML tags');
    }

    // 移除markdown代码块标记
    if (/```/.test(cleaned)) {
      cleaned = cleaned.replace(/```[a-zA-Z]*\s*/g, '').replace(/```/g, '');
      appliedFixes.push('Removed markdown code blocks');
    }

    // 移除前后的非JSON字符
    const beforeLength = cleaned.length;
    cleaned = cleaned.trim();
    
    // 移除开头的解释性文字（如："Here's the JSON:"）
    cleaned = cleaned.replace(/^[^{[]*(?=[{[])/m, '');
    
    if (cleaned.length !== beforeLength) {
      appliedFixes.push('Removed leading/trailing non-JSON content');
    }

    return cleaned;
  }

  /**
   * 按照大括号提取内容 - 你特别要求的功能
   */
  private static extractByBrackets(content: string, appliedFixes: string[]): string | null {
    // 查找第一个大括号或方括号
    const firstBraceIndex = content.search(/[{[]/);
    if (firstBraceIndex === -1) return null;

    const firstBrace = content[firstBraceIndex];
    const closingBrace = firstBrace === '{' ? '}' : ']';

    // 查找最后一个对应的括号
    let lastBraceIndex = -1;
    for (let i = content.length - 1; i >= firstBraceIndex; i--) {
      if (content[i] === closingBrace) {
        lastBraceIndex = i;
        break;
      }
    }

    if (lastBraceIndex === -1) return null;

    const extracted = content.substring(firstBraceIndex, lastBraceIndex + 1);
    
    // 只有当提取的内容明显更短时才应用此修复
    if (extracted.length < content.length * 0.9) {
      appliedFixes.push(`Extracted content between first ${firstBrace} and last ${closingBrace}`);
      return extracted;
    }

    return null;
  }

  /**
   * 修复常见的JSON格式问题
   */
  private static fixCommonJsonIssues(content: string, appliedFixes: string[]): string {
    let fixed = content;

    // 移除尾随逗号
    if (/,\s*[}\]]/.test(fixed)) {
      fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
      appliedFixes.push('Removed trailing commas');
    }

    // 为属性名添加双引号
    if (/([{,]\s*)(\w+):/.test(fixed)) {
      fixed = fixed.replace(/([{,]\s*)(\w+):/g, '$1"$2":');
      appliedFixes.push('Added quotes to property names');
    }

    // 将单引号替换为双引号
    if (/'[^']*'/.test(fixed)) {
      fixed = fixed.replace(/'/g, '"');
      appliedFixes.push('Replaced single quotes with double quotes');
    }

    // 修复没有引号的字符串值（简单情况）
    fixed = fixed.replace(/:(\s*)([a-zA-Z][a-zA-Z0-9_-]*)\s*([,}])/g, ':$1"$2"$3');

    // 压缩多余的空白字符
    if (/\s{2,}/.test(fixed)) {
      fixed = fixed.replace(/\s+/g, ' ');
      appliedFixes.push('Compressed whitespace');
    }

    return fixed;
  }

  /**
   * 修复AI特定的输出问题
   */
  private static fixAiSpecificIssues(content: string, appliedFixes: string[]): string {
    let fixed = content;

    // 修复AI可能输出的 "...more content..." 占位符
    if (/\.\.\.[^"]*\.\.\./.test(fixed)) {
      fixed = fixed.replace(/\.\.\.[^"]*\.\.\./g, '""');
      appliedFixes.push('Replaced ellipsis placeholders with empty strings');
    }

    // 修复未闭合的字符串（在行尾）
    if (/:\s*"[^"]*$/.test(fixed)) {
      fixed = fixed.replace(/(:\s*"[^"]*)$/gm, '$1"');
      appliedFixes.push('Closed unclosed strings');
    }

    // 修复中文字符可能引起的问题（确保中文内容被正确引用）
    fixed = fixed.replace(/:(\s*)([^",{}\[\]]+[\u4e00-\u9fff][^",{}\[\]]*)\s*([,}])/g, ':$1"$2"$3');

    return fixed;
  }

  /**
   * 验证解析结果是否符合预期结构
   */
  static validateStructure<T>(data: any, validator?: (data: any) => data is T): JsonParseResult<T> {
    if (validator && !validator(data)) {
      return {
        success: false,
        error: 'Data structure validation failed',
        data
      };
    }

    return {
      success: true,
      data: data as T
    };
  }
}

/**
 * 便捷函数：解析SERP查询JSON
 */
export function parseSerpQueryJson(content: string): JsonParseResult<Array<{query: string, researchGoal: string}>> {
  const result = RobustJsonParser.parse(content, 'SERP-Query');
  
  if (!result.success) return result;

  // 验证结构
  if (!Array.isArray(result.data)) {
    return {
      success: false,
      error: 'Expected array but got: ' + typeof result.data,
      originalContent: content
    };
  }

  // 验证数组元素
  for (let i = 0; i < result.data.length; i++) {
    const item = result.data[i];
    if (!item || typeof item !== 'object' || typeof item.query !== 'string') {
      return {
        success: false,
        error: `Invalid item at index ${i}: missing or invalid 'query' field`,
        originalContent: content,
        data: result.data
      };
    }
  }

  return result as JsonParseResult<Array<{query: string, researchGoal: string}>>;
}