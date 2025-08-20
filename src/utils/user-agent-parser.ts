/**
 * User-Agent解析工具
 * 提取浏览器、操作系统、设备等信息
 */

export interface ParsedUserAgent {
  // 浏览器信息
  browser_name: string | null;
  browser_version: string | null;
  
  // 操作系统信息
  os_name: string | null;
  os_version: string | null;
  
  // 设备信息
  device_type: string | null;
  platform: string | null;
  cpu_architecture: string | null;
}

/**
 * 解析User-Agent字符串
 */
export function parseUserAgent(userAgent: string): ParsedUserAgent {
  if (!userAgent) {
    return {
      browser_name: null,
      browser_version: null,
      os_name: null,
      os_version: null,
      device_type: null,
      platform: null,
      cpu_architecture: null
    };
  }

  const ua = userAgent.toLowerCase();
  
  // 解析浏览器信息
  const browser = parseBrowser(ua);
  
  // 解析操作系统信息
  const os = parseOperatingSystem(ua);
  
  // 解析设备类型
  const device = parseDevice(ua);
  
  // 解析平台和架构
  const platform = parsePlatform(ua);

  return {
    browser_name: browser.name,
    browser_version: browser.version,
    os_name: os.name,
    os_version: os.version,
    device_type: device.type,
    platform: platform.platform,
    cpu_architecture: platform.architecture
  };
}

/**
 * 解析浏览器信息
 */
function parseBrowser(ua: string): { name: string | null; version: string | null } {
  // Chrome (需要在Safari之前检查，因为Chrome包含Safari字符串)
  if (ua.includes('edg/')) {
    const match = ua.match(/edg\/([0-9.]+)/);
    return { name: 'Edge', version: match ? match[1] : null };
  }
  
  if (ua.includes('chrome/') && !ua.includes('edg/')) {
    const match = ua.match(/chrome\/([0-9.]+)/);
    return { name: 'Chrome', version: match ? match[1] : null };
  }

  // Firefox
  if (ua.includes('firefox/')) {
    const match = ua.match(/firefox\/([0-9.]+)/);
    return { name: 'Firefox', version: match ? match[1] : null };
  }

  // Safari (需要在最后检查，因为很多浏览器都包含Safari字符串)
  if (ua.includes('safari/') && !ua.includes('chrome/')) {
    const match = ua.match(/version\/([0-9.]+)/);
    return { name: 'Safari', version: match ? match[1] : null };
  }

  // Opera
  if (ua.includes('opr/') || ua.includes('opera/')) {
    const match = ua.match(/(?:opr|opera)\/([0-9.]+)/);
    return { name: 'Opera', version: match ? match[1] : null };
  }

  // Internet Explorer
  if (ua.includes('trident/') || ua.includes('msie')) {
    const match = ua.match(/(?:msie |rv:)([0-9.]+)/);
    return { name: 'Internet Explorer', version: match ? match[1] : null };
  }

  return { name: null, version: null };
}

/**
 * 解析操作系统信息
 */
function parseOperatingSystem(ua: string): { name: string | null; version: string | null } {
  // Windows
  if (ua.includes('windows nt')) {
    const match = ua.match(/windows nt ([0-9.]+)/);
    const version = match ? match[1] : null;
    let versionName = version;
    
    // Windows版本映射
    switch (version) {
      case '10.0': versionName = '10'; break;
      case '6.3': versionName = '8.1'; break;
      case '6.2': versionName = '8'; break;
      case '6.1': versionName = '7'; break;
      case '6.0': versionName = 'Vista'; break;
      case '5.1': versionName = 'XP'; break;
    }
    
    return { name: 'Windows', version: versionName };
  }

  // macOS
  if (ua.includes('mac os x')) {
    const match = ua.match(/mac os x ([0-9_]+)/);
    const version = match ? match[1].replace(/_/g, '.') : null;
    return { name: 'macOS', version };
  }

  // Linux
  if (ua.includes('linux')) {
    // Ubuntu
    if (ua.includes('ubuntu')) {
      const match = ua.match(/ubuntu\/([0-9.]+)/);
      return { name: 'Ubuntu', version: match ? match[1] : null };
    }
    return { name: 'Linux', version: null };
  }

  // Android
  if (ua.includes('android')) {
    const match = ua.match(/android ([0-9.]+)/);
    return { name: 'Android', version: match ? match[1] : null };
  }

  // iOS
  if (ua.includes('os ') && (ua.includes('iphone') || ua.includes('ipad'))) {
    const match = ua.match(/os ([0-9_]+)/);
    const version = match ? match[1].replace(/_/g, '.') : null;
    return { name: 'iOS', version };
  }

  return { name: null, version: null };
}

/**
 * 解析设备类型
 */
function parseDevice(ua: string): { type: string | null } {
  // Mobile devices
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
    return { type: 'mobile' };
  }

  // Tablet devices
  if (ua.includes('tablet') || ua.includes('ipad')) {
    return { type: 'tablet' };
  }

  // Desktop (default)
  return { type: 'desktop' };
}

/**
 * 解析平台和架构信息
 */
function parsePlatform(ua: string): { platform: string | null; architecture: string | null } {
  let platform = null;
  let architecture = null;

  // Windows平台
  if (ua.includes('windows')) {
    platform = 'Windows';
    if (ua.includes('wow64') || ua.includes('win64') || ua.includes('x64')) {
      architecture = 'x64';
    } else if (ua.includes('win32')) {
      architecture = 'x86';
    }
  }

  // Mac平台
  if (ua.includes('macintosh') || ua.includes('mac os x')) {
    platform = 'Mac';
    if (ua.includes('intel')) {
      architecture = 'x64';
    } else if (ua.includes('ppc')) {
      architecture = 'PowerPC';
    }
  }

  // Linux平台
  if (ua.includes('linux')) {
    platform = 'Linux';
    if (ua.includes('x86_64')) {
      architecture = 'x64';
    } else if (ua.includes('i686')) {
      architecture = 'x86';
    } else if (ua.includes('arm')) {
      architecture = 'ARM';
    }
  }

  // Mobile平台
  if (ua.includes('android')) {
    platform = 'Android';
    if (ua.includes('arm')) {
      architecture = 'ARM';
    }
  }

  if (ua.includes('iphone') || ua.includes('ipad')) {
    platform = 'iOS';
    architecture = 'ARM';
  }

  return { platform, architecture };
}

/**
 * 获取客户端环境信息的接口（用于前端）
 */
export interface ClientEnvironmentInfo {
  // User-Agent解析的信息
  browser_name: string | null;
  browser_version: string | null;
  os_name: string | null;
  os_version: string | null;
  device_type: string | null;
  platform: string | null;
  cpu_architecture: string | null;
  
  // JavaScript API获取的信息
  cpu_cores: number | null;
  memory_size: number | null;
  screen_resolution: string | null;
  timezone: string | null;
  language: string | null;
}

/**
 * 从User-Agent和客户端信息创建完整的环境信息
 */
export function createClientEnvironmentInfo(
  userAgent: string,
  clientInfo?: Partial<ClientEnvironmentInfo>
): ClientEnvironmentInfo {
  const parsed = parseUserAgent(userAgent);
  
  return {
    ...parsed,
    cpu_cores: clientInfo?.cpu_cores || null,
    memory_size: clientInfo?.memory_size || null,
    screen_resolution: clientInfo?.screen_resolution || null,
    timezone: clientInfo?.timezone || null,
    language: clientInfo?.language || null
  };
}