/**
 * multiApiKeyPolling 函数测试脚本
 * 测试多种输入格式和功能场景
 */

// 由于是TypeScript环境，我们需要模拟一些依赖
const mockLogger = {
  warn: (message: string, data?: any) => {
    console.log(`[WARN] ${message}`, data || '');
  },
  debug: (message: string, data?: any) => {
    console.log(`[DEBUG] ${message}`, data || '');
  },
  info: (message: string, data?: any) => {
    console.log(`[INFO] ${message}`, data || '');
  },
  error: (message: string, error?: any, data?: any) => {
    console.log(`[ERROR] ${message}`, error || '', data || '');
  }
};

// 模拟 radash 的 shuffle 函数
function shuffle<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// 模拟全局状态
const globalKeyStatus = new Map<string, Map<string, any>>();
const keyToProviderMap = new Map<string, string>();

// 模拟 buildKeyToProviderMap 函数
function buildKeyToProviderMap(provider: string, apiKeys: string) {
  const keys = apiKeys.split(',').map(k => k.trim()).filter(k => k);
  keys.forEach(key => {
    keyToProviderMap.set(key, provider);
  });
}

// 模拟 inferProviderFromCallStack 函数
function inferProviderFromCallStack(): string {
  // 简化版本，返回空字符串
  return '';
}

// 模拟 getCooldownTime 函数
function getCooldownTime(statusCode: number): number {
  if (statusCode === 432) return 7 * 24 * 60 * 60 * 1000;
  if (statusCode === 429) return 60 * 60 * 1000;
  if (statusCode === 401) return 24 * 60 * 60 * 1000;
  if (statusCode === 403) return 24 * 60 * 60 * 1000;
  if (statusCode >= 400 && statusCode < 500) return 2 * 60 * 60 * 1000;
  if (statusCode >= 500 && statusCode < 600) return 30 * 60 * 1000;
  return 60 * 60 * 1000;
}

// 模拟 markApiKeyFailed 函数
function markApiKeyFailed(key: string, statusCode: number = 0): void {
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

// 要测试的 multiApiKeyPolling 函数
function multiApiKeyPolling(apiKeys: string | string[] = "") {
  try {
    // 统一处理不同类型的输入
    let keys: string[];
    let originalInput: string | string[];
    
    if (Array.isArray(apiKeys)) {
      // 如果是数组，直接使用
      keys = apiKeys.filter(k => typeof k === 'string' && k.trim().length > 0);
      originalInput = apiKeys;
    } else if (typeof apiKeys === 'string') {
      // 如果是字符串，按逗号分割
      keys = apiKeys.split(',').map(k => k.trim()).filter(k => k.length > 0);
      originalInput = apiKeys;
    } else {
      // 无效输入类型
      mockLogger.warn('Invalid API keys input type', { type: typeof apiKeys });
      return "";
    }
    
    if (keys.length === 0) {
      return "";
    }
    
    if (keys.length === 1) {
      return keys[0];
    }
    
    // 通过多种方式确定 provider
    let provider = "";
    
    // 1. 通过 key 反查 provider
    for (const key of keys) {
      const mappedProvider = keyToProviderMap.get(key);
      if (mappedProvider) {
        provider = mappedProvider;
        break;
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
    
    // 建立映射关系（用于下次调用）- 只有字符串输入才需要
    if (typeof originalInput === 'string') {
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
  
  // 测试1: 字符串输入 - 单个key
  console.log('测试1: 字符串输入 - 单个key');
  const result1 = multiApiKeyPolling('key1');
  console.log('输入: "key1"');
  console.log('输出:', result1);
  console.log('期望: "key1"');
  console.log('结果:', result1 === 'key1' ? '✅ 通过' : '❌ 失败');
  console.log('');
  
  // 测试2: 字符串输入 - 多个key逗号分隔
  console.log('测试2: 字符串输入 - 多个key逗号分隔');
  const result2 = multiApiKeyPolling('key1,key2,key3');
  console.log('输入: "key1,key2,key3"');
  console.log('输出:', result2);
  console.log('期望: key1, key2, 或 key3 中的任意一个');
  console.log('结果:', ['key1', 'key2', 'key3'].includes(result2) ? '✅ 通过' : '❌ 失败');
  console.log('');
  
  // 测试3: 数组输入 - 单个key
  console.log('测试3: 数组输入 - 单个key');
  const result3 = multiApiKeyPolling(['key1']);
  console.log('输入: ["key1"]');
  console.log('输出:', result3);
  console.log('期望: "key1"');
  console.log('结果:', result3 === 'key1' ? '✅ 通过' : '❌ 失败');
  console.log('');
  
  // 测试4: 数组输入 - 多个key
  console.log('测试4: 数组输入 - 多个key');
  const result4 = multiApiKeyPolling(['key1', 'key2', 'key3']);
  console.log('输入: ["key1", "key2", "key3"]');
  console.log('输出:', result4);
  console.log('期望: key1, key2, 或 key3 中的任意一个');
  console.log('结果:', ['key1', 'key2', 'key3'].includes(result4) ? '✅ 通过' : '❌ 失败');
  console.log('');
  
  // 测试5: 空字符串输入
  console.log('测试5: 空字符串输入');
  const result5 = multiApiKeyPolling('');
  console.log('输入: ""');
  console.log('输出:', result5);
  console.log('期望: ""');
  console.log('结果:', result5 === '' ? '✅ 通过' : '❌ 失败');
  console.log('');
  
  // 测试6: 空数组输入
  console.log('测试6: 空数组输入');
  const result6 = multiApiKeyPolling([]);
  console.log('输入: []');
  console.log('输出:', result6);
  console.log('期望: ""');
  console.log('结果:', result6 === '' ? '✅ 通过' : '❌ 失败');
  console.log('');
  
  // 测试7: 包含空格的字符串输入
  console.log('测试7: 包含空格的字符串输入');
  const result7 = multiApiKeyPolling('key1, key2, key3');
  console.log('输入: "key1, key2, key3"');
  console.log('输出:', result7);
  console.log('期望: key1, key2, 或 key3 中的任意一个');
  console.log('结果:', ['key1', 'key2', 'key3'].includes(result7) ? '✅ 通过' : '❌ 失败');
  console.log('');
  
  // 测试8: 包含空字符串的数组输入
  console.log('测试8: 包含空字符串的数组输入');
  const result8 = multiApiKeyPolling(['key1', '', 'key2', '   ', 'key3']);
  console.log('输入: ["key1", "", "key2", "   ", "key3"]');
  console.log('输出:', result8);
  console.log('期望: key1, key2, 或 key3 中的任意一个');
  console.log('结果:', ['key1', 'key2', 'key3'].includes(result8) ? '✅ 通过' : '❌ 失败');
  console.log('');
  
  // 测试9: Provider映射功能
  console.log('测试9: Provider映射功能');
  // 预先建立映射
  buildKeyToProviderMap('test-provider', 'mapped-key1,mapped-key2,mapped-key3');
  const result9 = multiApiKeyPolling('mapped-key1,mapped-key2,mapped-key3');
  console.log('输入: "mapped-key1,mapped-key2,mapped-key3" (已建立provider映射)');
  console.log('输出:', result9);
  console.log('期望: mapped-key1, mapped-key2, 或 mapped-key3 中的任意一个');
  console.log('结果:', ['mapped-key1', 'mapped-key2', 'mapped-key3'].includes(result9) ? '✅ 通过' : '❌ 失败');
  console.log('');
  
  // 测试10: 失败key的过滤功能
  console.log('测试10: 失败key的过滤功能');
  // 预先建立映射并标记某个key为失败
  buildKeyToProviderMap('test-provider-2', 'good-key1,bad-key2,good-key3');
  markApiKeyFailed('bad-key2', 429); // 标记为失败
  const result10 = multiApiKeyPolling('good-key1,bad-key2,good-key3');
  console.log('输入: "good-key1,bad-key2,good-key3" (bad-key2已标记为失败)');
  console.log('输出:', result10);
  console.log('期望: good-key1 或 good-key3 (不应该包含bad-key2)');
  console.log('结果:', ['good-key1', 'good-key3'].includes(result10) ? '✅ 通过' : '❌ 失败');
  console.log('');
  
  // 测试11: 无效输入类型
  console.log('测试11: 无效输入类型');
  const result11 = multiApiKeyPolling(null as any);
  console.log('输入: null');
  console.log('输出:', result11);
  console.log('期望: ""');
  console.log('结果:', result11 === '' ? '✅ 通过' : '❌ 失败');
  console.log('');
  
  // 测试12: 数字输入 (应该被拒绝)
  console.log('测试12: 数字输入');
  const result12 = multiApiKeyPolling(123 as any);
  console.log('输入: 123');
  console.log('输出:', result12);
  console.log('期望: ""');
  console.log('结果:', result12 === '' ? '✅ 通过' : '❌ 失败');
  console.log('');
  
  console.log('=== 测试完成 ===');
  
  // 显示当前的状态信息
  console.log('\n=== 当前状态信息 ===');
  console.log('Key到Provider的映射数量:', keyToProviderMap.size);
  console.log('Provider状态数量:', globalKeyStatus.size);
  
  if (keyToProviderMap.size > 0) {
    console.log('\nKey映射详情:');
    for (const [key, provider] of keyToProviderMap.entries()) {
      console.log(`  ${key.substring(0, 8)}... -> ${provider}`);
    }
  }
  
  if (globalKeyStatus.size > 0) {
    console.log('\n失败Key状态:');
    for (const [provider, keyMap] of globalKeyStatus.entries()) {
      console.log(`  Provider: ${provider}`);
      for (const [key, status] of keyMap.entries()) {
        console.log(`    ${key.substring(0, 8)}... -> 失败次数: ${status.failCount}, 状态码: ${status.statusCode}`);
      }
    }
  }
}

// 运行测试
if (typeof window === 'undefined') {
  // Node.js环境
  runTests();
} else {
  // 浏览器环境
  window.runMultiApiKeyPollingTests = runTests;
  console.log('在浏览器中运行: runMultiApiKeyPollingTests()');
}

// 导出函数供其他测试使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    multiApiKeyPolling,
    buildKeyToProviderMap,
    markApiKeyFailed,
    runTests
  };
}