/**
 * multiApiKeyPolling 函数测试脚本
 * 测试多种输入格式和功能场景
 */

// 模拟依赖
const mockLogger = {
  warn: (message, data) => console.log(`[WARN] ${message}`, data || ''),
  debug: (message, data) => console.log(`[DEBUG] ${message}`, data || ''),
  info: (message, data) => console.log(`[INFO] ${message}`, data || ''),
  error: (message, error, data) => console.log(`[ERROR] ${message}`, error || '', data || '')
};

function shuffle(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// 模拟全局状态
const globalKeyStatus = new Map();
const keyToProviderMap = new Map();

function buildKeyToProviderMap(provider, apiKeys) {
  const keys = apiKeys.split(',').map(k => k.trim()).filter(k => k);
  keys.forEach(key => {
    keyToProviderMap.set(key, provider);
  });
}

function inferProviderFromCallStack() {
  return '';
}

function getCooldownTime(statusCode) {
  if (statusCode === 432) return 7 * 24 * 60 * 60 * 1000;
  if (statusCode === 429) return 60 * 60 * 1000;
  if (statusCode === 401) return 24 * 60 * 60 * 1000;
  if (statusCode === 403) return 24 * 60 * 60 * 1000;
  if (statusCode >= 400 && statusCode < 500) return 2 * 60 * 60 * 1000;
  if (statusCode >= 500 && statusCode < 600) return 30 * 60 * 1000;
  return 60 * 60 * 1000;
}

function markApiKeyFailed(key, statusCode = 0) {
  if (!key) return;
  
  const provider = keyToProviderMap.get(key);
  if (!provider) return;
  
  let failedKeyMap = globalKeyStatus.get(provider);
  if (!failedKeyMap) {
    failedKeyMap = new Map();
    globalKeyStatus.set(provider, failedKeyMap);
  }
  
  const existing = failedKeyMap.get(key);
  if (existing) {
    existing.failedAt = Date.now();
    existing.failCount++;
    existing.statusCode = statusCode;
  } else {
    failedKeyMap.set(key, {
      failedAt: Date.now(),
      failCount: 1,
      statusCode
    });
  }
}

// 改进后的 multiApiKeyPolling 函数
function multiApiKeyPolling(apiKeys = "", options = {}) {
  try {
    // 统一处理不同类型的输入
    let keys;
    let originalInput;
    let shouldUseProviderLogic = false;
    
    if (Array.isArray(apiKeys)) {
      // 如果是数组，直接使用数组元素
      keys = apiKeys.filter(k => typeof k === 'string' && k.trim().length > 0);
      originalInput = apiKeys;
      shouldUseProviderLogic = keys.length > 1;
    } else if (typeof apiKeys === 'string') {
      // 如果是字符串，需要智能判断是否应该分割
      if (options.forceSplit) {
        // 强制分割模式：按逗号分割
        keys = apiKeys.split(',').map(k => k.trim()).filter(k => k.length > 0);
        shouldUseProviderLogic = keys.length > 1;
      } else if (options.provider) {
        // 如果指定了provider，认为是多个key，需要分割
        keys = apiKeys.split(',').map(k => k.trim()).filter(k => k.length > 0);
        shouldUseProviderLogic = keys.length > 1;
      } else {
        // 智能判断模式：检查是否有逗号以及是否有现有映射
        if (apiKeys.includes(',')) {
          // 检查是否有现有映射关系
          const hasExistingMapping = Array.from(keyToProviderMap.keys()).some(key => 
            apiKeys.split(',').map(k => k.trim()).includes(key)
          );
          
          if (hasExistingMapping) {
            // 有现有映射，认为是多个key
            keys = apiKeys.split(',').map(k => k.trim()).filter(k => k.length > 0);
            shouldUseProviderLogic = true;
          } else {
            // 没有现有映射，当作单个key处理
            keys = [apiKeys];
            shouldUseProviderLogic = false;
          }
        } else {
          // 没有逗号，当作单个key
          keys = [apiKeys];
          shouldUseProviderLogic = false;
        }
      }
      originalInput = apiKeys;
    } else {
      // 无效输入类型
      mockLogger.warn('Invalid API keys input type', { type: typeof apiKeys });
      return "";
    }
    
    if (keys.length === 0) {
      return "";
    }

    // 如果只有一个key且不需要使用provider逻辑，直接返回
    if (keys.length === 1 && !shouldUseProviderLogic) {
      return keys[0];
    }
    
    // 通过多种方式确定 provider
    let provider = options?.provider || "";
    
    // 1. 通过 key 反查 provider
    if (!provider) {
      for (const key of keys) {
        const mappedProvider = keyToProviderMap.get(key);
        if (mappedProvider) {
          provider = mappedProvider;
          break;
        }
      }
    }
    
    // 2. 如果找不到，尝试从调用栈推断
    if (!provider) {
      provider = inferProviderFromCallStack();
    }
    
    // 3. 如果还是找不到对应的 provider，使用原有逻辑（向后兼容）
    if (!provider) {
      // 如果是数组输入，直接随机选择
      if (Array.isArray(originalInput)) {
        return shuffle(keys)[0];
      }
      // 如果是字符串输入，建立映射后再随机选择
      buildKeyToProviderMap("unknown", originalInput as string);
      return shuffle(keys)[0];
    }
    
    // 建立映射关系（用于下次调用）- 只有字符串输入且没有指定provider时才需要
    if (typeof originalInput === 'string' && !options.provider) {
      buildKeyToProviderMap(provider, originalInput);
    }
    
    // 获取该 provider 的失败 key 记录
    const failedKeyMap = globalKeyStatus.get(provider) || new Map();
    const now = Date.now();
    
    // 过滤掉失败的 key
    const availableKeys = keys.filter(key => {
      const failedStatus = failedKeyMap.get(key);
      if (!failedStatus) return true;
      
      // 检查是否过了冷却期
      const cooldownTime = getCooldownTime(failedStatus.statusCode || 0);
      return now - failedStatus.failedAt > cooldownTime;
    });
    
    if (availableKeys.length === 0) {
      // 如果没有可用的key，尝试从所有key中随机选择一个（降级处理）
      mockLogger.warn(`No available API keys for provider: ${provider}, falling back to random selection`);
      return shuffle(keys)[0];
    }
    
    // 随机选择一个可用的 key
    return shuffle(availableKeys)[0];
  } catch (error) {
    // 如果任何步骤出错，回退到原有逻辑（向后兼容）
    mockLogger.warn('API key polling failed, falling back to random selection', error);
    
    // 根据输入类型进行降级处理
    if (Array.isArray(apiKeys)) {
      const validKeys = apiKeys.filter(k => typeof k === 'string' && k.trim().length > 0);
      return validKeys.length > 0 ? shuffle(validKeys)[0] : "";
    } else {
      const keys = (apiKeys as string).split(',').map(k => k.trim()).filter(k => k.length > 0);
      return keys.length > 0 ? shuffle(keys)[0] : "";
    }
  }
}

// 测试用例
function runTests() {
  console.log('=== 开始测试 multiApiKeyPolling 函数 ===\n');
  
  // 清理状态
  keyToProviderMap.clear();
  globalKeyStatus.clear();
  
  // 测试1: 单个key字符串
  console.log('测试1: 单个key字符串');
  const result1 = multiApiKeyPolling('single-key-123');
  console.log('输入: "single-key-123"');
  console.log('输出:', result1);
  console.log('期望: "single-key-123"');
  console.log('结果:', result1 === 'single-key-123' ? '✅ 通过' : '❌ 失败');
  console.log('');
  
  // 测试2: 包含逗号的字符串（作为单个key）
  console.log('测试2: 包含逗号的字符串（作为单个key）');
  const result2 = multiApiKeyPolling('key1,key2,key3-as-single-key');
  console.log('输入: "key1,key2,key3-as-single-key"');
  console.log('输出:', result2);
  console.log('期望: "key1,key2,key3-as-single-key" (不分割)');
  console.log('结果:', result2 === 'key1,key2,key3-as-single-key' ? '✅ 通过' : '❌ 失败');
  console.log('');
  
  // 测试3: 强制分割模式
  console.log('测试3: 强制分割模式');
  const result3 = multiApiKeyPolling('key1,key2,key3', { forceSplit: true });
  console.log('输入: "key1,key2,key3", { forceSplit: true }');
  console.log('输出:', result3);
  console.log('期望: key1, key2, 或 key3 中的任意一个');
  console.log('结果:', ['key1', 'key2', 'key3'].includes(result3) ? '✅ 通过' : '❌ 失败');
  console.log('');
  
  // 测试4: 指定provider模式
  console.log('测试4: 指定provider模式');
  const result4 = multiApiKeyPolling('key1,key2,key3', { provider: 'test-provider' });
  console.log('输入: "key1,key2,key3", { provider: "test-provider" }');
  console.log('输出:', result4);
  console.log('期望: key1, key2, 或 key3 中的任意一个');
  console.log('结果:', ['key1', 'key2', 'key3'].includes(result4) ? '✅ 通过' : '❌ 失败');
  console.log('');
  
  // 测试5: 数组输入
  console.log('测试5: 数组输入');
  const result5 = multiApiKeyPolling(['array-key1', 'array-key2', 'array-key3']);
  console.log('输入: ["array-key1", "array-key2", "array-key3"]');
  console.log('输出:', result5);
  console.log('期望: array-key1, array-key2, 或 array-key3 中的任意一个');
  console.log('结果:', ['array-key1', 'array-key2', 'array-key3'].includes(result5) ? '✅ 通过' : '❌ 失败');
  console.log('');
  
  // 测试6: 预先建立映射关系
  console.log('测试6: 预先建立映射关系');
  buildKeyToProviderMap('mapped-provider', 'mapped-key1,mapped-key2,mapped-key3');
  const result6 = multiApiKeyPolling('mapped-key1,mapped-key2,mapped-key3');
  console.log('输入: "mapped-key1,mapped-key2,mapped-key3" (已建立映射)');
  console.log('输出:', result6);
  console.log('期望: mapped-key1, mapped-key2, 或 mapped-key3 中的任意一个');
  console.log('结果:', ['mapped-key1', 'mapped-key2', 'mapped-key3'].includes(result6) ? '✅ 通过' : '❌ 失败');
  console.log('');
  
  // 测试7: 失败key过滤
  console.log('测试7: 失败key过滤');
  buildKeyToProviderMap('filter-provider', 'good-key1,bad-key2,good-key3');
  markApiKeyFailed('bad-key2', 429);
  const result7 = multiApiKeyPolling('good-key1,bad-key2,good-key3', { provider: 'filter-provider' });
  console.log('输入: "good-key1,bad-key2,good-key3" (bad-key2已失败)');
  console.log('输出:', result7);
  console.log('期望: good-key1 或 good-key3');
  console.log('结果:', ['good-key1', 'good-key3'].includes(result7) ? '✅ 通过' : '❌ 失败');
  console.log('');
  
  // 测试8: 向后兼容测试
  console.log('测试8: 向后兼容测试');
  const result8 = multiApiKeyPolling('legacy-key1,legacy-key2,legacy-key3');
  console.log('输入: "legacy-key1,legacy-key2,legacy-key3" (无映射，无选项)');
  console.log('输出:', result8);
  console.log('期望: "legacy-key1,legacy-key2,legacy-key3" (作为单个key)');
  console.log('结果:', result8 === 'legacy-key1,legacy-key2,legacy-key3' ? '✅ 通过' : '❌ 失败');
  console.log('');
  
  // 测试9: 空输入测试
  console.log('测试9: 空输入测试');
  const result9 = multiApiKeyPolling('');
  console.log('输入: ""');
  console.log('输出:', result9);
  console.log('期望: ""');
  console.log('结果:', result9 === '' ? '✅ 通过' : '❌ 失败');
  console.log('');
  
  // 测试10: 数组中的单个元素
  console.log('测试10: 数组中的单个元素');
  const result10 = multiApiKeyPolling(['single-array-key']);
  console.log('输入: ["single-array-key"]');
  console.log('输出:', result10);
  console.log('期望: "single-array-key"');
  console.log('结果:', result10 === 'single-array-key' ? '✅ 通过' : '❌ 失败');
  console.log('');
  
  console.log('=== 测试完成 ===');
  
  // 显示状态信息
  console.log('\n=== 状态信息 ===');
  console.log('Key映射数量:', keyToProviderMap.size);
  console.log('Provider状态数量:', globalKeyStatus.size);
  
  if (keyToProviderMap.size > 0) {
    console.log('\nKey映射详情:');
    for (const [key, provider] of keyToProviderMap.entries()) {
      console.log(`  ${key.substring(0, 16)}... -> ${provider}`);
    }
  }
}

// 使用示例
function usageExamples() {
  console.log('\n=== 使用示例 ===\n');
  
  console.log('1. 基本使用（向后兼容）：');
  console.log('   multiApiKeyPolling("key1,key2,key3") // 作为单个key处理');
  console.log('   multiApiKeyPolling("single-key") // 直接返回');
  console.log('');
  
  console.log('2. 强制分割模式：');
  console.log('   multiApiKeyPolling("key1,key2,key3", { forceSplit: true }) // 分割成多个key');
  console.log('');
  
  console.log('3. 指定provider模式：');
  console.log('   multiApiKeyPolling("key1,key2,key3", { provider: "openai" }) // 分割并使用provider逻辑');
  console.log('');
  
  console.log('4. 数组输入：');
  console.log('   multiApiKeyPolling(["key1", "key2", "key3"]) // 直接使用数组元素');
  console.log('');
  
  console.log('5. 预先建立映射：');
  console.log('   buildKeyToProviderMap("openai", "key1,key2,key3")');
  console.log('   multiApiKeyPolling("key1,key2,key3") // 自动检测并分割');
}

// 运行测试
if (typeof window === 'undefined') {
  runTests();
  usageExamples();
} else {
  window.runMultiApiKeyPollingTests = runTests;
  window.showMultiApiKeyPollingExamples = usageExamples;
  console.log('在浏览器中运行:');
  console.log('  runMultiApiKeyPollingTests()');
  console.log('  showMultiApiKeyPollingExamples()');
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    multiApiKeyPolling,
    buildKeyToProviderMap,
    markApiKeyFailed,
    runTests,
    usageExamples
  };
}