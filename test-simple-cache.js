// 测试简化的任务缓存系统
const testUrl = 'http://localhost:3001/api/sse/live';
const testParams = new URLSearchParams({
  query: '测试任务缓存',
  language: 'zh-CN',
  enableCitationImage: 'true',
  enableReferences: 'true'
});

console.log('Testing simplified task cache system...');
console.log('Test URL:', `${testUrl}?${testParams}`);

// 第一次请求
console.log('\n=== First Request (should execute research) ===');
fetch(`${testUrl}?${testParams}`, {
  method: 'GET',
  headers: {
    'Accept': 'text/event-stream',
    'Cache-Control': 'no-cache'
  }
})
.then(response => {
  console.log('Response Status:', response.status);
  console.log('Response Headers:');
  response.headers.forEach((value, key) => {
    console.log(`  ${key}: ${value}`);
  });
  
  const taskId = response.headers.get('X-Task-ID');
  console.log('Task ID:', taskId);
  
  // 模拟等待几秒后发起第二次请求
  setTimeout(() => {
    console.log('\n=== Second Request (should return cached result) ===');
    fetch(`${testUrl}?${testParams}`, {
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache'
      }
    })
    .then(response => {
      console.log('Response Status:', response.status);
      const secondTaskId = response.headers.get('X-Task-ID');
      console.log('Task ID:', secondTaskId);
      console.log('Task IDs match:', taskId === secondTaskId);
      
      if (taskId === secondTaskId) {
        console.log('✅ SUCCESS: Task reuse working correctly!');
      } else {
        console.log('❌ FAILURE: Different task IDs generated');
      }
    })
    .catch(error => {
      console.error('Second request error:', error.message);
    });
  }, 3000);
})
.catch(error => {
  console.error('First request error:', error.message);
});