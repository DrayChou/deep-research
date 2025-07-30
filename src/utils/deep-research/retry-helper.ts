/**
 * 重新生成SERP查询的重试逻辑
 * 当JSON解析失败时，重新调用AI接口获取新的结果
 */
async function regenerateSERPQueryWithRetry(
  originalSystemPrompt: string,
  originalUserPrompt: string,
  originalText: string,
  originalContent: string,
  retryCount: number,
  maxRetries: number,
  getThinkingModel: () => Promise<any>,
  logger: any
): Promise<{ data: any; text: string; content: string }> {
  logger.info(`Retrying AI call for SERP query generation (attempt ${retryCount + 1}/${maxRetries})`);
  
  try {
    const retryModel = await getThinkingModel();
    const enhancedPrompt = originalUserPrompt + 
      (retryCount > 1 ? '\n\nIMPORTANT: Please respond with valid JSON format only. No markdown, no extra text, just the JSON array.' : '') +
      (retryCount > 2 ? '\n\nCRITICAL: You MUST return valid JSON. Format: [{"query": "...", "researchGoal": "..."}]' : '');
    
    const { text: retryText } = await generateText({
      model: retryModel,
      system: originalSystemPrompt,
      prompt: enhancedPrompt,
    });
    
    // 重新处理返回的内容
    let newContent = "";
    const retryThinkTagProcessor = new ThinkTagStreamProcessor();
    retryThinkTagProcessor.processChunk(retryText, (data) => {
      newContent += data;
    });
    retryThinkTagProcessor.end();
    
    logger.debug('Retrieved new AI response for SERP query', {
      retryAttempt: retryCount + 1,
      responseLength: retryText.length,
      processedLength: newContent.length
    });
    
    // 尝试解析新的响应
    try {
      const cleanedContent = removeJsonMarkdown(newContent);
      const data = JSON.parse(cleanedContent);
      
      logger.info('Retry AI call successful and JSON parsed', {
        attempt: retryCount + 1,
        dataLength: Array.isArray(data) ? data.length : 0
      });
      
      return { data, text: retryText, content: newContent };
    } catch (parseError) {
      logger.warn('Retry AI call response still has JSON parsing issues', {
        error: parseError instanceof Error ? parseError.message : 'Unknown parse error',
        retryAttempt: retryCount + 1
      });
      throw parseError;
    }
    
  } catch (retryError) {
    logger.error('AI retry call failed', retryError instanceof Error ? retryError : undefined);
    throw retryError;
  }
}