/**
 * 改进后的 multiApiKeyPolling 函数测试脚本
 * 测试简化的逻辑流程
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
function multiApiKeyPolling(apiKeys = "") {
  try {
    // 第一步：预处理，统一转换为数组
    let keys;
    let originalInput;
    
    if (Array.isArray(apiKeys)) {
      // 数组输入：直接过滤使用
      keys = apiKeys.filter(k => typeof k === 'string' && k.trim().length > 0);
      originalInput = apiKeys;
    } else if (typeof apiKeys === 'string') {
      // 字符串输入：按逗号分割
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
    
    // 第二步：根据数组长度判断处理逻辑
    if (keys.length >= 2) {
      // 情况1：多个key，直接在这个数组中处理
      return handleMultipleKeys(keys, originalInput);
    } else {
      // 情况2：单个key，需要反查provider然后获取完整的key列表
      return handleSingleKey(keys[0], originalInput);
    }
  } catch (error) {
    // 错误处理：回退到基础逻辑
    mockLogger.warn('API key polling failed, falling back to random selection', error);
    return fallbackKeySelection(apiKeys);
  }
}

// 处理多个key的情况
function handleMultipleKeys(keys, originalInput) {
  // 尝试确定provider（用于失败状态管理）
  const provider = findProviderForKeys(keys);
  
  if (provider) {
    // 如果找到了provider，使用该provider的失败状态进行过滤
    const failedKeyMap = globalKeyStatus.get(provider) || new Map();
    const now = Date.now();
    
    const availableKeys = keys.filter(key => {
      const failedStatus = failedKeyMap.get(key);
      if (!failedStatus) return true;
      
      const cooldownTime = getCooldownTime(failedStatus.statusCode || 0);
      return now - failedStatus.failedAt > cooldownTime;
    });
    
    if (availableKeys.length > 0) {
      return shuffle(availableKeys)[0];
    }
  }
  
  // 没有provider或没有可用key，直接随机选择
  return shuffle(keys)[0];
}

// 处理单个key的情况
function handleSingleKey(key, originalInput) {
  // 通过key反查provider
  const provider = keyToProviderMap.get(key);
  
  if (!provider) {
    // 没有找到provider，直接返回这个key
    return key;
  }
  
  // 找到了provider，需要获取该provider的所有key
  const allProviderKeys = getAllKeysForProvider(provider);
  
  if (allProviderKeys.length <= 1) {
    // 该provider只有这一个key，直接返回
    return key;
  }
  
  // 过滤掉失败的key
  const failedKeyMap = globalKeyStatus.get(provider) || new Map();
  const now = Date.now();
  
  const availableKeys = allProviderKeys.filter(k => {
    const failedStatus = failedKeyMap.get(k);
    if (!failedStatus) return true;
    
    const cooldownTime = getCooldownTime(failedStatus.statusCode || 0);
    return now - failedStatus.failedAt > cooldownTime;
  });
  
  if (availableKeys.length === 0) {
    // 没有可用key，回退到原始key
    mockLogger.warn(`No available API keys for provider: ${provider}, falling back to original key`);
    return key;
  }
  
  // 随机选择一个可用的key
  return shuffle(availableKeys)[0];
}

// 为keys查找provider
function findProviderForKeys(keys) {
  // 遍历keys，找到第一个有映射的provider
  for (const key of keys) {
    const provider = keyToProviderMap.get(key);
    if (provider) {
      return provider;
    }
  }
  
  // 如果没有找到，尝试从调用栈推断
  return inferProviderFromCallStack();
}

// 获取指定provider的所有key
function getAllKeysForProvider(provider) {
  // 遍历keyToProviderMap，找到属于该provider的所有key
  const providerKeys = [];
  
  for (const [key, mappedProvider] of keyToProviderMap.entries()) {
    if (mappedProvider === provider) {
      providerKeys.push(key);
    }
  }
  
  return providerKeys;
}

// 回退选择逻辑
function fallbackKeySelection(apiKeys) {
  if (Array.isArray(apiKeys)) {
    const validKeys = apiKeys.filter(k => typeof k === 'string' && k.trim().length > 0);
    return validKeys.length > 0 ? shuffle(validKeys)[0] : "";
  } else {
    const keys = (apiKeys).split(',').map(k => k.trim()).filter(k => k.length > 0);
    return keys.length > 0 ? shuffle(keys)[0] : "";
  }
}

// 测试用例
function runTests() {
  console.log('=== 开始测试改进后的 multiApiKeyPolling 函数 ===\n');
  
  // 清理状态
  keyToProviderMap.clear();
  globalKeyStatus.clear();
  
  // 测试1: 单个key字符串（无映射）
  console.log('测试1: 单个key字符串（无映射）');
  const result1 = multiApiKeyPolling('single-key-123');
  console.log('输入: "single-key-123"');
  console.log('输出:', result1);
  console.log('期望: "single-key-123"');
  console.log('结果:', result1 === 'single-key-123' ? '✅ 通过' : '❌ 失败');
  console.log('');
  
  // 测试2: 多个key字符串（无映射）
  console.log('测试2: 多个key字符串（无映射）');
  const result2 = multiApiKeyPolling('key1,key2,key3');
  console.log('输入: "key1,key2,key3"');
  console.log('输出:', result2);
  console.log('期望: key1, key2, 或 key3 中的任意一个');
  console.log('结果:', ['key1', 'key2', 'key3'].includes(result2) ? '✅ 通过' : '❌ 失败');
  console.log('');
  
  // 测试3: 数组输入（多个元素）
  console.log('测试3: 数组输入（多个元素）');
  const result3 = multiApiKeyPolling(['array-key1', 'array-key2', 'array-key3']);
  console.log('输入: ["array-key1", "array-key2", "array-key3"]');
  console.log('输出:', result3);
  console.log('期望: array-key1, array-key2, 或 array-key3 中的任意一个');
  console.log('结果:', ['array-key1', 'array-key2', 'array-key3'].includes(result3) ? '✅ 通过' : '❌ 失败');
  console.log('');
  
  // 测试4: 单个key有映射的情况
  console.log('测试4: 单个key有映射的情况');
  buildKeyToProviderMap('test-provider', 'mapped-key1,mapped-key2,mapped-key3');
  const result4 = multiApiKeyPolling('mapped-key1');
  console.log('输入: "mapped-key1" (有映射到provider)');
  console.log('输出:', result4);
  console.log('期望: mapped-key1, mapped-key2, 或 mapped-key3 中的任意一个');
  console.log('结果:', ['mapped-key1', 'mapped-key2', 'mapped-key3'].includes(result4) ? '✅ 通过' : '❌ 失败');
  console.log('');
  
  // 测试5: 单个key有映射，但其他key失败的情况
  console.log('测试5: 单个key有映射，但其他key失败的情况');
  buildKeyToProviderMap('fail-provider', 'good-key1,bad-key2,good-key3');
  markApiKeyFailed('bad-key2', 429);
  const result5 = multiApiKeyPolling('good-key1');
  console.log('输入: "good-key1" (bad-key2已失败)');
  console.log('输出:', result5);
  console.log('期望: good-key1 或 good-key3 (不应该包含bad-key2)');
  console.log('结果:', ['good-key1', 'good-key3'].includes(result5) ? '✅ 通过' : '❌ 失败');
  console.log('');
  
  // 测试6: 多个key有失败的情况
  console.log('测试6: 多个key有失败的情况');
  buildKeyToProviderMap('multi-fail-provider', 'multi-good1,multi-bad2,multi-good3');
  markApiKeyFailed('multi-bad2', 429);
  const result6 = multiApiKeyPolling('multi-good1,multi-bad2,multi-good3');
  console.log('输入: "multi-good1,multi-bad2,multi-good3" (multi-bad2已失败)');
  console.log('输出:', result6);
  console.log('期望: multi-good1 或 multi-good3 (不应该包含multi-bad2)');
  console.log('结果:', ['multi-good1', 'multi-good3'].includes(result6) ? '✅ 通过' : '❌ 失败');
  console.log('');
  
  // 测试7: 包含逗号的完整key（作为单个key）
  console.log('测试7: 包含逗号的完整key（作为单个key）');
  const result7 = multiApiKeyPolling('complete-key-with,commas');
  console.log('输入: "complete-key-with,commas"');
  console.log('输出:', result7);
  console.log('期望: "complete-key-with,commas" (不分割)');
  console.log('结果:', result7 === 'complete-key-with,commas' ? '✅ 通过' : '❌ 失败');
  console.log('');
  
  // 测试8: 空输入
  console.log('测试8: 空输入');
  const result8 = multiApiKeyPolling('');
  console.log('输入: ""');
  console.log('输出:', result8);
  console.log('期望: ""');
  console.log('结果:', result8 === '' ? '✅ 通过' : '❌ 失败');
  console.log('');
  
  // 测试9: 数组中的单个元素
  console.log('测试9: 数组中的单个元素');
  const result9 = multiApiKeyPolling(['single-in-array']);
  console.log('输入: ["single-in-array"]');
  console.log('输出:', result9);
  console.log('期望: "single-in-array"');
  console.log('结果:', result9 === 'single-in-array' ? '✅ 通过' : '❌ 失败');
  console.log('');
  
  // 测试10: 所有key都失败的情况
  console.log('测试10: 所有key都失败的情况');
  buildKeyToProviderMap('all-fail-provider', 'all-fail1,all-fail2,all-fail3');
  markApiKeyFailed('all-fail1', 429);
  markApiKeyFailed('all-fail2', 429);
  markApiKeyFailed('all-fail3', 429);
  const result10 = multiApiKeyPolling('all-fail1');
  console.log('输入: "all-fail1" (所有相关key都已失败)');
  console.log('输出:', result10);
  console.log('期望: "all-fail1" (回退到原始key)');
  console.log('结果:', result10 === 'all-fail1' ? '✅ 通过' : '❌ 失败');
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
  
  if (globalKeyStatus.size > 0) {
    console.log('\n失败Key状态:');
    for (const [provider, keyMap] of globalKeyStatus.entries()) {
      console.log(`  Provider: ${provider}`);
      for (const [key, status] of keyMap.entries()) {
        console.log(`    ${key.substring(0, 16)}... -> 失败次数: ${status.failCount}, 状态码: ${status.statusCode}`);
      }
    }
  }
}

// 使用示例
function usageExamples() {
  console.log('\n=== 使用示例 ===\n');
  
  console.log('1. 基本使用：');
  console.log('   multiApiKeyPolling("single-key") // 返回单个key');
  console.log('   multiApiKeyPolling("key1,key2,key3") // 在三个key中随机选择');
  console.log('   multiApiKeyPolling(["key1", "key2", "key3"]) // 在三个key中随机选择');
  console.log('');
  
  console.log('2. 建立映射关系：');
  console.log('   buildKeyToProviderMap("openai", "sk-123,sk-456,sk-789")');
  console.log('   multiApiKeyPolling("sk-123") // 可能返回sk-123, sk-456, 或sk-789');
  console.log('');
  
  console.log('3. 失败标记：');
  console.log('   markApiKeyFailed("sk-456", 429) // 标记sk-456为失败');
  console.log('   multiApiKeyPolling("sk-123") // 只会在sk-123和sk-789中选择');
  console.log('');
  
  console.log('4. 逻辑流程：');
  console.log('   - 输入预处理：统一转换为数组');
  console.log('   - 数组长度 >= 2：直接在数组中过滤和选择');
  console.log('   - 数组长度 == 1：反查provider，获取完整key列表，然后选择');
}

// 运行测试
if (typeof window === 'undefined') {
  runTests();
  usageExamples();
} else {
  window.runImprovedMultiApiKeyPollingTests = runTests;
  window.showImprovedMultiApiKeyPollingExamples = usageExamples;
  console.log('在浏览器中运行:');
  console.log('  runImprovedMultiApiKeyPollingTests()');
  console.log('  showImprovedMultiApiKeyPollingExamples()');
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