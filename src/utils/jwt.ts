/**
 * JWT解析工具
 */

interface JWTPayload {
  sub?: string;       // 用户名/用户ID
  username?: string;  // 用户名
  name?: string;      // 用户名
  user_name?: string; // 用户名
  exp?: number;       // 过期时间
  iat?: number;       // 签发时间
  [key: string]: any; // 其他字段
}

/**
 * 解析JWT令牌获取用户信息
 */
export function parseJWT(token: string): JWTPayload | null {
  try {
    // JWT格式：header.payload.signature
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.warn('[JWT] 无效的JWT格式');
      return null;
    }

    // 解码payload部分（Base64URL编码）
    const payload = parts[1];
    // 替换Base64URL字符为Base64字符
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    // 添加padding
    const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
    
    // 解码
    const decoded = atob(padded);
    const payloadObj = JSON.parse(decoded);
    
    return payloadObj as JWTPayload;
  } catch (error) {
    console.error('[JWT] 解析JWT失败:', error);
    return null;
  }
}

/**
 * 从JWT中提取用户名
 */
export function extractUsernameFromJWT(token: string): string | null {
  const payload = parseJWT(token);
  if (!payload) {
    return null;
  }

  // 尝试多个可能的用户名字段
  return payload.username || 
         payload.name || 
         payload.user_name || 
         payload.sub || 
         null;
}

/**
 * 检查JWT是否过期
 */
export function isJWTExpired(token: string): boolean {
  const payload = parseJWT(token);
  if (!payload || !payload.exp) {
    return true; // 无法验证则认为过期
  }

  const currentTime = Math.floor(Date.now() / 1000);
  return payload.exp < currentTime;
}

/**
 * 验证JWT格式
 */
export function isValidJWTFormat(token: string): boolean {
  if (!token || typeof token !== 'string') {
    return false;
  }

  const parts = token.split('.');
  return parts.length === 3 && parts.every(part => part.length > 0);
}
