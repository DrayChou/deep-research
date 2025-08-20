/**
 * 客户端信息收集器
 * 使用JavaScript API收集浏览器和设备硬件信息
 */

import { ClientEnvironmentInfo } from './user-agent-parser';

/**
 * 收集客户端环境信息
 * 此函数只能在浏览器环境中运行
 */
export async function collectClientInfo(): Promise<Partial<ClientEnvironmentInfo>> {
  if (typeof window === 'undefined') {
    return {};
  }

  const info: Partial<ClientEnvironmentInfo> = {};

  try {
    // 1. 获取CPU核心数
    if ('navigator' in window && 'hardwareConcurrency' in navigator) {
      info.cpu_cores = navigator.hardwareConcurrency;
    }

    // 2. 获取内存信息 (仅在支持的浏览器中)
    if ('navigator' in window && 'deviceMemory' in navigator) {
      // deviceMemory返回的是GB，转换为MB
      info.memory_size = Math.round((navigator as any).deviceMemory * 1024);
    }

    // 3. 获取屏幕分辨率
    if ('screen' in window) {
      info.screen_resolution = `${screen.width}x${screen.height}`;
    }

    // 4. 获取时区信息
    try {
      info.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      info.timezone = null;
    }

    // 5. 获取语言信息
    if ('navigator' in window) {
      info.language = navigator.language || (navigator as any).userLanguage || null;
    }

  } catch (error) {
    console.warn('Error collecting client info:', error);
  }

  return info;
}

/**
 * 获取详细的客户端信息（包含更多实验性API）
 */
export async function collectDetailedClientInfo(): Promise<Partial<ClientEnvironmentInfo> & {
  // 额外信息
  connection_type?: string;
  max_touch_points?: number;
  color_depth?: number;
  pixel_depth?: number;
  available_screen?: string;
  gpu_info?: string;
}> {
  const basicInfo = await collectClientInfo();
  const detailedInfo: any = { ...basicInfo };

  try {
    // 6. 获取网络连接信息
    if ('navigator' in window && 'connection' in navigator) {
      const connection = (navigator as any).connection;
      if (connection) {
        detailedInfo.connection_type = connection.effectiveType || connection.type || null;
      }
    }

    // 7. 获取触摸支持信息
    if ('navigator' in window && 'maxTouchPoints' in navigator) {
      detailedInfo.max_touch_points = navigator.maxTouchPoints;
    }

    // 8. 获取显示器信息
    if ('screen' in window) {
      detailedInfo.color_depth = screen.colorDepth || null;
      detailedInfo.pixel_depth = screen.pixelDepth || null;
      detailedInfo.available_screen = `${screen.availWidth}x${screen.availHeight}`;
    }

    // 9. 获取GPU信息（WebGL）
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl') as WebGLRenderingContext | null;
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
          detailedInfo.gpu_info = renderer || null;
        }
      }
    } catch {
      // GPU信息获取失败，忽略
    }

  } catch (error) {
    console.warn('Error collecting detailed client info:', error);
  }

  return detailedInfo;
}

/**
 * 创建客户端信息收集器的Hook（用于React组件）
 * 注意：这个函数需要在React环境中使用
 */
export function useClientInfo() {
  // 动态导入React避免非React环境的错误
  if (typeof window !== 'undefined' && typeof (window as any).React !== 'undefined') {
    const React = (window as any).React;
    
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [clientInfo, setClientInfo] = React.useState({});
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [isLoading, setIsLoading] = React.useState(true);

    // eslint-disable-next-line react-hooks/rules-of-hooks
    React.useEffect(() => {
      collectClientInfo().then(info => {
        setClientInfo(info);
        setIsLoading(false);
      });
    }, []);

    return { clientInfo, isLoading };
  }
  
  // 非React环境返回默认值
  return {
    clientInfo: {},
    isLoading: false
  };
}

/**
 * 将客户端信息发送到服务器的工具函数
 */
export async function sendClientInfoToServer(endpoint: string = '/api/client-info') {
  try {
    const clientInfo = await collectDetailedClientInfo();
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userAgent: navigator.userAgent,
        clientInfo
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to send client info to server:', error);
    throw error;
  }
}

/**
 * 获取系统信息的备用方法（使用UserAgentData API）
 */
export async function getNavigatorUserAgentData(): Promise<any> {
  if (typeof window === 'undefined' || !('navigator' in window)) {
    return null;
  }

  try {
    // 新的 User-Agent Client Hints API
    if ('userAgentData' in navigator) {
      const uaData = (navigator as any).userAgentData;
      
      // 获取基本信息
      const basicInfo = {
        brands: uaData.brands || [],
        mobile: uaData.mobile || false,
        platform: uaData.platform || null
      };

      // 获取高熵值信息（需要权限）
      try {
        const highEntropyValues = await uaData.getHighEntropyValues([
          'architecture',
          'bitness',
          'model',
          'platformVersion',
          'uaFullVersion'
        ]);
        
        return {
          ...basicInfo,
          ...highEntropyValues
        };
      } catch {
        // 如果获取高熵值失败，返回基本信息
        return basicInfo;
      }
    }
  } catch (error) {
    console.warn('Error getting UserAgentData:', error);
  }

  return null;
}