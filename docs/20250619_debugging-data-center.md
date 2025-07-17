## 数据中心集成调试指南

### 🔧 测试步骤

1. **设置环境变量**：
   确保 `.env.local` 中有正确的数据中心URL：
   ```
   NEXT_PUBLIC_DATA_CENTER_URL=http://localhost:8000
   ```

2. **使用测试URL（如果有JWT令牌）**：
   ```
   http://localhost:3003/?jwt=your_jwt_token
   ```

3. **调试无JWT情况**：
   直接访问：`http://localhost:3003`
   然后查看浏览器控制台的调试信息

### 🐛 调试检查点

当您输入问题"明天上海下雨嘛?"并点击开始思考时，请检查：

1. **浏览器控制台日志**：
   - 查找 `[useDeepResearch] 检查是否创建话题:` 的日志
   - 确认各项条件的值：
     - `currentTopicId`: 应该为空（首次使用）
     - `isConnected`: 应该为true（如果有JWT和数据中心URL）
     - `hasContent`: 应该为true（AI有回复内容）
     - `hasJwt`: 检查是否有JWT令牌
     - `hasDataBaseUrl`: 检查是否有数据中心URL

2. **网络请求**：
   如果条件满足，应该看到以下请求：
   - `POST /api/v1/chat/topics` (创建话题)
   - `POST /api/v1/chat/topics/{topic_id}/messages` (保存用户消息)
   - `POST /api/v1/chat/topics/{topic_id}/messages` (保存AI回复)

### 🚨 常见问题

1. **`isConnected` 为 false**：
   - 缺少JWT令牌
   - 缺少数据中心URL
   - JWT令牌无效

2. **有JWT但无数据中心URL**：
   - 检查环境变量设置
   - 重启开发服务器

3. **有数据中心URL但无JWT**：
   - 应该显示全屏认证错误界面
   - 如果没有显示，说明数据中心URL配置有问题

### 💡 快速测试方法

在浏览器控制台中运行：
```javascript
// 检查当前认证状态
const authState = JSON.parse(localStorage.getItem('auth-storage') || '{}');
console.log('Auth State:', authState);

// 手动设置测试数据（仅用于调试）
window.testDataCenter?.runAll("test_jwt", "http://localhost:8000");
```
