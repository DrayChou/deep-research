/**
 * 日志改进测试脚本
 * 用于验证详细的日志记录和错误透传功能
 */

// 简单的日志测试实现
class TestLogger {
  constructor(context = 'Test') {
    this.context = context;
  }

  formatMessage(level, message, data) {
    const timestamp = new Date().toISOString();
    const dataStr = data ? ` | Data: ${JSON.stringify(data).substring(0, 200)}` : '';
    return `${timestamp} [${level}] [${this.context}] ${message}${dataStr}`;
  }

  debug(message, data) {
    console.log(this.formatMessage('DEBUG', message, data));
  }

  info(message, data) {
    console.log(this.formatMessage('INFO', message, data));
  }

  warn(message, data) {
    console.warn(this.formatMessage('WARN', message, data));
  }

  error(message, error, data) {
    const errorData = error ? {
      message: error.message,
      stack: error.stack,
      name: error.name,
      ...data
    } : data;
    console.error(this.formatMessage('ERROR', message, errorData));
  }

  logLLMCall(action, config, input, output, duration) {
    this.info(`LLM Call: ${action}`, {
      config,
      input: input ? {
        length: typeof input === 'string' ? input.length : 'object',
        preview: typeof input === 'string' ? input.substring(0, 50) : 'object'
      } : undefined,
      output: output ? {
        length: typeof output === 'string' ? output.length : 'object',
        preview: typeof output === 'string' ? output.substring(0, 50) : 'object'
      } : undefined,
      duration
    });
  }

  logStep(step, status, data) {
    this.info(`Step: ${step} - ${status}`, data);
  }
}

const logger = { getInstance: (context) => new TestLogger(context) };

// 测试日志功能
function testLogger() {
  console.log('=== 测试日志功能 ===');
  
  const testLogger = logger.getInstance('Test');
  
  // 测试不同级别的日志
  testLogger.debug('这是一个调试消息', { key: 'value', number: 123 });
  testLogger.info('这是一个信息消息', { status: 'success' });
  testLogger.warn('这是一个警告消息', { warning: 'something might be wrong' });
  testLogger.error('这是一个错误消息', new Error('测试错误'), { context: 'test' });
  
  // 测试LLM调用日志
  testLogger.logLLMCall('testCall', 
    { model: 'gpt-4', provider: 'openai' },
    { promptLength: 1000, content: '测试输入' },
    { responseLength: 2000, content: '测试输出' },
    1500
  );
  
  // 测试步骤日志
  testLogger.logStep('testStep', 'start', { data: 'test data' });
  testLogger.logStep('testStep', 'end', { result: 'success', duration: 1000 });
  
  console.log('✅ 日志功能测试完成');
}

// 测试错误透传
function testErrorHandling() {
  console.log('\n=== 测试错误处理 ===');
  
  const testLogger = logger.getInstance('ErrorTest');
  
  try {
    // 模拟一个错误
    throw new Error('这是一个测试错误');
  } catch (error) {
    testLogger.error('捕获到错误', error, {
      context: 'test',
      additionalInfo: '这是一个额外的信息'
    });
  }
  
  console.log('✅ 错误处理测试完成');
}

// 测试数据截断
function testDataTruncation() {
  console.log('\n=== 测试数据截断 ===');
  
  const testLogger = logger.getInstance('TruncateTest');
  
  // 测试长字符串截断
  const longString = '这是一个非常长的字符串'.repeat(100);
  testLogger.info('长字符串测试', { longString });
  
  // 测试复杂对象截断
  const complexObject = {
    nested: {
      very: {
        deep: {
          object: {
            with: {
              lots: {
                of: {
                  data: '深层嵌套的数据'.repeat(50)
                }
              }
            }
          }
        }
      }
    },
    simple: '简单数据'
  };
  testLogger.info('复杂对象测试', complexObject);
  
  console.log('✅ 数据截断测试完成');
}

// 运行所有测试
function runAllTests() {
  console.log('开始运行日志改进测试...\n');
  
  testLogger();
  testErrorHandling();
  testDataTruncation();
  
  console.log('\n🎉 所有测试完成！');
}

// 如果直接运行此脚本
if (require.main === module) {
  runAllTests();
}

module.exports = { testLogger, testErrorHandling, testDataTruncation, runAllTests };