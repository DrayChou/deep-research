// 临时文件 - 新的JSON解析逻辑
// 改进的 JSON 解析，添加重试策略和详细的错误处理
      let data;
      let parseSuccess = false;
      let retryCount = 0;
      const maxRetries = 3;
      
      while (!parseSuccess && retryCount < maxRetries) {
        try {
          const cleanedContent = removeJsonMarkdown(content);
          this.logger.debug(`Attempting to parse SERP query JSON (attempt ${retryCount + 1}/${maxRetries})`, {
            originalLength: text.length,
            processedLength: content.length,
            cleanedLength: cleanedContent.length,
            cleanedPreview: cleanedContent.substring(0, 200) + (cleanedContent.length > 200 ? '...' : '')
          });
          
          data = JSON.parse(cleanedContent);
          parseSuccess = true;
          
          this.logger.info('SERP query JSON parsed successfully', {
            attempt: retryCount + 1,
            dataLength: Array.isArray(data) ? data.length : 0
          });
          
        } catch (parseError) {
          retryCount++;
          
          this.logger.warn(`JSON parse failed (attempt ${retryCount}/${maxRetries})`, {
            error: parseError instanceof Error ? parseError.message : 'Unknown parse error',
            contentPreview: content.substring(0, 300) + (content.length > 300 ? '...' : ''),
            contentLength: content.length,
            fullOriginalContent: text, // 记录完整的原始返回内容
            fullCleanedContent: removeJsonMarkdown(content) // 记录完整的清理后内容
          });
          
          if (retryCount < maxRetries) {
            // 尝试修复常见的 JSON 格式问题
            let repairedContent = removeJsonMarkdown(content);
            
            // 修复 1: 移除 thinking 标签残留
            repairedContent = repairedContent.replace(/e_start|e_end|e_start|<\/think>/g, '');
            
            // 修复 2: 移除多余的换行和空格
            repairedContent = repairedContent.replace(/\n\s*\n/g, '\n').trim();
            
            // 修复 3: 尝试找到 JSON 数组的开始和结束
            const arrayStart = repairedContent.indexOf('[');
            const arrayEnd = repairedContent.lastIndexOf(']');
            
            if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
              repairedContent = repairedContent.substring(arrayStart, arrayEnd + 1);
              this.logger.debug('Extracted JSON array from content', {
                extractedLength: repairedContent.length,
                extractedPreview: repairedContent.substring(0, 200)
              });
            }
            
            // 更新content为修复后的版本，用于下次重试
            content = repairedContent;
            
            // 短暂延迟后重试
            await new Promise(resolve => setTimeout(resolve, 100 * retryCount));
          }
        }
      }
      
      // 如果所有重试都失败了，抛出异常中断任务
      if (!parseSuccess) {
        this.logger.error('SERP query JSON parsing failed after all retries', undefined, {
          retryAttempts: maxRetries,
          originalContent: text,
          finalRepairedContent: content,
          errorDetails: 'AI returned malformed JSON that could not be repaired after multiple attempts'
        });
        
        throw new Error(`Failed to parse SERP query JSON after ${maxRetries} attempts. AI response was not in valid JSON format. Please check the AI model configuration and prompts.`);
      }