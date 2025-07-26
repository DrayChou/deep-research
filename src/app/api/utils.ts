import { completePath } from "@/utils/url";
import { NextRequest } from "next/server";
import { parseJWT, isJWTExpired, isValidJWTFormat } from "@/utils/jwt";

// JWT验证和配置查询相关接口
interface UserConfig {
  provider?: string;
  apiKey?: string;
  apiProxy?: string;
  thinkingModel?: string;
  networkingModel?: string;
  searchProvider?: string;
  searchApiKey?: string;
  searchApiProxy?: string;
  language?: string;
  theme?: string;
  [key: string]: any;
}

interface JwtValidationResult {
  valid: boolean;
  error?: string;
  config?: UserConfig;
  userId?: string;
  username?: string;
}

// AI provider API base url
const GOOGLE_GENERATIVE_AI_API_BASE_URL =
  process.env.GOOGLE_GENERATIVE_AI_API_BASE_URL ||
  "https://generativelanguage.googleapis.com";
const OPENROUTER_API_BASE_URL =
  process.env.OPENROUTER_API_BASE_URL || "https://openrouter.ai/api";
const OPENAI_API_BASE_URL =
  process.env.OPENAI_API_BASE_URL || "https://api.openai.com";
const ANTHROPIC_API_BASE_URL =
  process.env.ANTHROPIC_API_BASE_URL || "https://api.anthropic.com";
const DEEPSEEK_API_BASE_URL =
  process.env.DEEPSEEK_API_BASE_URL || "https://api.deepseek.com";
const XAI_API_BASE_URL = process.env.XAI_API_BASE_URL || "https://api.x.ai";
const MISTRAL_API_BASE_URL =
  process.env.MISTRAL_API_BASE_URL || "https://api.mistral.ai";
const AZURE_API_BASE_URL = `https://${process.env.AZURE_RESOURCE_NAME}.openai.azure.com/openai/deployments`;
const OPENAI_COMPATIBLE_API_BASE_URL =
  process.env.OPENAI_COMPATIBLE_API_BASE_URL || "";
const POLLINATIONS_API_BASE_URL =
  process.env.POLLINATIONS_API_BASE_URL ||
  "https://text.pollinations.ai/openai";
const OLLAMA_API_BASE_URL =
  process.env.OLLAMA_API_BASE_URL || "http://0.0.0.0:11434";
// Search provider API base url
const TAVILY_API_BASE_URL =
  process.env.TAVILY_API_BASE_URL || "https://api.tavily.com";
const FIRECRAWL_API_BASE_URL =
  process.env.FIRECRAWL_API_BASE_URL || "https://api.firecrawl.dev";
const EXA_API_BASE_URL = process.env.EXA_API_BASE_URL || "https://api.exa.ai";
const BOCHA_API_BASE_URL =
  process.env.BOCHA_API_BASE_URL || "https://api.bochaai.com";
const SEARXNG_API_BASE_URL =
  process.env.SEARXNG_API_BASE_URL || "http://0.0.0.0:8080";

const GOOGLE_GENERATIVE_AI_API_KEY =
  process.env.GOOGLE_GENERATIVE_AI_API_KEY || "";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";
const XAI_API_KEY = process.env.XAI_API_KEY || "";
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || "";
const AZURE_API_KEY = process.env.AZURE_API_KEY || "";
const OPENAI_COMPATIBLE_API_KEY = process.env.OPENAI_COMPATIBLE_API_KEY || "";
// Search provider API key
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || "";
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY || "";
const EXA_API_KEY = process.env.EXA_API_KEY || "";
const BOCHA_API_KEY = process.env.BOCHA_API_KEY || "";

export function getAIProviderBaseURL(provider: string) {
  switch (provider) {
    case "google":
      return completePath(GOOGLE_GENERATIVE_AI_API_BASE_URL, "/v1beta");
    case "openai":
      return completePath(OPENAI_API_BASE_URL, "/v1");
    case "anthropic":
      return completePath(ANTHROPIC_API_BASE_URL, "/v1");
    case "deepseek":
      return completePath(DEEPSEEK_API_BASE_URL, "/v1");
    case "xai":
      return completePath(XAI_API_BASE_URL, "/v1");
    case "mistral":
      return completePath(MISTRAL_API_BASE_URL, "/v1");
    case "azure":
      return AZURE_API_BASE_URL;
    case "openrouter":
      return completePath(OPENROUTER_API_BASE_URL, "/api/v1");
    case "openaicompatible":
      return completePath(OPENAI_COMPATIBLE_API_BASE_URL, "/v1");
    case "pollinations":
      return completePath(POLLINATIONS_API_BASE_URL, "/v1");
    case "ollama":
      return completePath(OLLAMA_API_BASE_URL, "/api");
    default:
      throw new Error("Unsupported Provider: " + provider);
  }
}

export function getAIProviderApiKey(provider: string) {
  switch (provider) {
    case "google":
      return GOOGLE_GENERATIVE_AI_API_KEY;
    case "openai":
      return OPENAI_API_KEY;
    case "anthropic":
      return ANTHROPIC_API_KEY;
    case "deepseek":
      return DEEPSEEK_API_KEY;
    case "xai":
      return XAI_API_KEY;
    case "mistral":
      return MISTRAL_API_KEY;
    case "azure":
      return AZURE_API_KEY;
    case "openrouter":
      return OPENROUTER_API_KEY;
    case "openaicompatible":
      return OPENAI_COMPATIBLE_API_KEY;
    case "pollinations":
    case "ollama":
      return "";
    default:
      throw new Error("Unsupported Provider: " + provider);
  }
}

export function getSearchProviderBaseURL(provider: string) {
  switch (provider) {
    case "tavily":
      return TAVILY_API_BASE_URL;
    case "firecrawl":
      return FIRECRAWL_API_BASE_URL;
    case "exa":
      return EXA_API_BASE_URL;
    case "bocha":
      return BOCHA_API_BASE_URL;
    case "searxng":
      return SEARXNG_API_BASE_URL;
    case "model":
      return "";
    default:
      throw new Error("Unsupported Provider: " + provider);
  }
}

export function getSearchProviderApiKey(provider: string) {
  switch (provider) {
    case "tavily":
      return TAVILY_API_KEY;
    case "firecrawl":
      return FIRECRAWL_API_KEY;
    case "exa":
      return EXA_API_KEY;
    case "bocha":
      return BOCHA_API_KEY;
    case "searxng":
    case "model":
      return "";
    default:
      throw new Error("Unsupported Provider: " + provider);
  }
}

/**
 * 从请求中提取JWT令牌
 * 支持从URL参数或Authorization头中读取
 */
export function extractJwtFromRequest(req: NextRequest): string | null {
  // 优先从URL参数中获取JWT
  const jwtFromUrl = req.nextUrl.searchParams.get('jwt');
  if (jwtFromUrl && isValidJWTFormat(jwtFromUrl)) {
    return jwtFromUrl;
  }

  // 从Authorization头中获取JWT
  const authHeader = req.headers.get('authorization');
  if (authHeader) {
    // 支持 "Bearer <token>" 格式
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      if (isValidJWTFormat(token)) {
        return token;
      }
    }
    // 直接使用authorization头的值
    else if (isValidJWTFormat(authHeader)) {
      return authHeader;
    }
  }

  return null;
}

/**
 * 验证JWT并查询用户配置
 * 直接通过查询system-configs来验证JWT，一举两得
 */
export async function validateJwtAndGetConfig(jwt: string, dataBaseUrl?: string): Promise<JwtValidationResult> {
  try {
    // 验证JWT格式
    if (!isValidJWTFormat(jwt)) {
      return { valid: false, error: 'Invalid JWT format' };
    }

    // 检查JWT是否过期（本地验证，避免不必要的网络请求）
    if (isJWTExpired(jwt)) {
      return { valid: false, error: 'JWT expired' };
    }

    // 解析JWT获取用户信息
    const payload = parseJWT(jwt);
    if (!payload) {
      return { valid: false, error: 'Invalid JWT payload' };
    }

    const username = payload.username || payload.name || payload.user_name || payload.sub;
    const userId = payload.sub || payload.id || payload.user_id;

    // 如果没有配置数据中心URL，只进行本地JWT验证
    if (!dataBaseUrl) {
      return {
        valid: true,
        userId,
        username,
        config: {} // 空配置
      };
    }

    // 直接查询system-configs，一次请求完成JWT验证和配置获取
    const baseUrl = dataBaseUrl.replace(/\/+$/, '');
    let apiUrl = '';
    
    // 构建API URL，添加 category=deep-research 参数
    if (baseUrl.endsWith('/api/v1')) {
      apiUrl = `${baseUrl}/system-configs?category=deep-research`;
    } else {
      apiUrl = `${baseUrl}/api/v1/system-configs?category=deep-research`;
    }

    console.log('[JWT Validation] Fetching system-configs from:', apiUrl);
    console.log('[JWT Validation] Using JWT:', `${jwt.substring(0, 20)}...`);

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt}`,
      },
    });

    console.log('[JWT Validation] System-configs response status:', response.status);

    if (!response.ok) {
      // 获取详细的错误信息
      let responseText = '';
      try {
        responseText = await response.text();
        console.log('[JWT Validation] Error response body:', responseText);
      } catch (e) {
        console.log('[JWT Validation] Could not read error response body');
      }

      // 如果查询配置失败，说明JWT无效或权限不足
      let errorMessage = 'Authentication failed';
      if (response.status === 401) {
        errorMessage = 'Invalid or expired JWT token';
      } else if (response.status === 403) {
        errorMessage = 'Insufficient permissions';
      } else {
        errorMessage = `Authentication error: ${response.status} ${response.statusText}`;
      }
      
      console.log('[JWT Validation] System-configs fetch failed:', {
        status: response.status,
        statusText: response.statusText,
        error: errorMessage,
        responseBody: responseText
      });
      return { valid: false, error: errorMessage };
    }

    const responseData = await response.json();
    console.log('[JWT Validation] System-configs response received:', {
      hasResponse: !!responseData,
      responseCode: responseData?.code,
      responseMessage: responseData?.message,
      dataLength: responseData?.data?.length || 0
    });
    
    // 处理API返回的数据结构，将数组转换为键值对对象
    let configData: UserConfig = {};
    if (responseData?.code === 200 && responseData?.data && Array.isArray(responseData.data)) {
      responseData.data.forEach((item: any) => {
        if (item.key && item.value !== undefined) {
          configData[item.key] = item.value;
        }
      });
      console.log('[JWT Validation] Config loaded:', {
        provider: configData.provider,
        searchProvider: configData.searchProvider,
        configCount: Object.keys(configData).length
      });
    } else {
      console.warn('[JWT Validation] Invalid system-configs response format');
    }
    
    return {
      valid: true,
      userId,
      username,
      config: configData
    };

  } catch (error) {
    console.error('[JWT] Validation and config query failed:', error);
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Network or server error'
    };
  }
}

/**
 * JWT验证中间件（可选验证）
 * 如果有JWT则验证并获取配置，如果没有JWT则返回空配置
 */
export async function optionalJwtAuthMiddleware(req: NextRequest): Promise<JwtValidationResult> {
  console.log('[JWT Auth] Starting optional JWT authentication...');
  
  // 从请求中提取JWT
  const jwt = extractJwtFromRequest(req);
  
  // 如果没有提供JWT，返回有效但空配置的结果
  if (!jwt) {
    console.log('[JWT Auth] No JWT provided, using default configuration');
    return { 
      valid: true, 
      config: {},
      userId: undefined,
      username: undefined
    };
  }

  console.log('[JWT Auth] JWT found, validating and fetching config...');
  
  // 从URL参数中获取数据中心URL（可选），默认使用localhost:8080
  const dataBaseUrl = req.nextUrl.searchParams.get('dataBaseUrl') || 
                      process.env.NEXT_PUBLIC_DATA_CENTER_URL || 
                      'http://localhost:8080';

  console.log('[JWT Auth] Data center URL:', dataBaseUrl);

  // 验证JWT并获取配置
  const result = await validateJwtAndGetConfig(jwt, dataBaseUrl);
  
  if (result.valid && result.config) {
    console.log('[JWT Auth] Configuration loaded successfully:', {
      userId: result.userId,
      username: result.username,
      configCount: Object.keys(result.config || {}).length
    });
  } else {
    console.log('[JWT Auth] Failed to load configuration:', result.error);
  }
  
  return result;
}

/**
 * JWT验证中间件（强制验证）- 保留原有功能
 * 验证JWT并将用户配置注入到请求中
 */
export async function jwtAuthMiddleware(req: NextRequest): Promise<JwtValidationResult> {
  // 从请求中提取JWT
  const jwt = extractJwtFromRequest(req);
  if (!jwt) {
    return { valid: false, error: 'No JWT token provided' };
  }

  // 从URL参数中获取数据中心URL（可选）
  const dataBaseUrl = req.nextUrl.searchParams.get('dataBaseUrl') || 
                      process.env.NEXT_PUBLIC_DATA_CENTER_URL || 
                      '';

  // 验证JWT并获取配置
  return await validateJwtAndGetConfig(jwt, dataBaseUrl);
}

/**
 * 获取最终配置：JWT配置 > URL参数 > 环境变量
 * @param jwtConfig 从JWT验证获取的用户配置
 * @param req 请求对象
 * @param provider AI提供商类型
 * @param searchProvider 搜索提供商类型
 */
export function getFinalConfig(
  jwtConfig: UserConfig, 
  req: NextRequest, 
  provider?: string,
  searchProvider?: string
): UserConfig {
  const searchParams = req.nextUrl.searchParams;
  
  // 基础配置合并：URL参数 > JWT配置
  const baseConfig = { ...jwtConfig };
  
  // URL参数覆盖JWT配置
  const paramMappings: Record<string, string> = {
    'provider': 'provider',
    'apiKey': 'apiKey',
    'apiProxy': 'apiProxy',
    'thinkingModel': 'thinkingModel',
    'networkingModel': 'networkingModel',
    'taskModel': 'networkingModel',
    'searchProvider': 'searchProvider',
    'language': 'language',
    'theme': 'theme'
  };

  Object.entries(paramMappings).forEach(([paramName, configKey]) => {
    const paramValue = searchParams.get(paramName);
    if (paramValue !== null) {
      baseConfig[configKey] = paramValue;
    }
  });

  return baseConfig;
}

/**
 * 获取AI提供商的最终配置
 * 先从配置中获取provider，然后根据provider获取对应的配置
 * 优先级：JWT配置 > URL参数 > 环境变量
 */
export function getAIProviderConfig(jwtConfig: UserConfig, req: NextRequest, defaultProvider?: string) {
  console.log('[AI Config] Starting AI provider configuration...');
  
  const config = getFinalConfig(jwtConfig, req);
  
  // 先获取provider：URL参数 > JWT配置 > 传入的默认值
  const provider = req.nextUrl.searchParams.get('provider') || 
                   config.provider || 
                   defaultProvider || 
                   'openaicompatible';
  
  console.log('[AI Config] Provider selection:', {
    fromURL: req.nextUrl.searchParams.get('provider'),
    fromJWT: config.provider,
    defaultProvider,
    selected: provider
  });
  
  // 安全获取环境变量baseURL
  const getEnvBaseURL = (provider: string) => {
    try {
      const baseURL = getAIProviderBaseURL(provider);
      console.log(`[AI Config] Environment base URL for ${provider}:`, baseURL);
      return baseURL;
    } catch (error) {
      console.warn(`[AI Config] No base URL configured for provider: ${provider}`);
      return '';
    }
  };
  
  // 根据provider获取对应的配置
  let apiKey = '';
  let apiProxy = '';
  
  // console.log('[AI Config] Available JWT config keys:', Object.keys(config)); // 简化日志
  
  switch (provider) {
    case 'google':
      apiKey = config.googleApiKey || config.apiKey || getAIProviderApiKey(provider);
      apiProxy = config.googleApiProxy || config.apiProxy || getEnvBaseURL(provider);
      break;
    case 'openai':
      apiKey = config.openAIApiKey || config.apiKey || getAIProviderApiKey(provider);
      apiProxy = config.openAIApiProxy || config.apiProxy || getEnvBaseURL(provider);
      break;
    case 'anthropic':
      apiKey = config.anthropicApiKey || config.apiKey || getAIProviderApiKey(provider);
      apiProxy = config.anthropicApiProxy || config.apiProxy || getEnvBaseURL(provider);
      break;
    case 'deepseek':
      apiKey = config.deepseekApiKey || config.apiKey || getAIProviderApiKey(provider);
      apiProxy = config.deepseekApiProxy || config.apiProxy || getEnvBaseURL(provider);
      break;
    case 'openrouter':
      apiKey = config.openRouterApiKey || config.apiKey || getAIProviderApiKey(provider);
      apiProxy = config.openRouterApiProxy || config.apiProxy || getEnvBaseURL(provider);
      break;
    case 'xai':
      apiKey = config.xAIApiKey || config.apiKey || getAIProviderApiKey(provider);
      apiProxy = config.xAIApiProxy || config.apiProxy || getEnvBaseURL(provider);
      break;
    case 'mistral':
      apiKey = config.mistralApiKey || config.apiKey || getAIProviderApiKey(provider);
      apiProxy = config.mistralApiProxy || config.apiProxy || getEnvBaseURL(provider);
      break;
    case 'azure':
      apiKey = config.azureApiKey || config.apiKey || getAIProviderApiKey(provider);
      apiProxy = config.azureApiProxy || config.apiProxy || getEnvBaseURL(provider);
      break;
    case 'openaicompatible':
      console.log('[AI Config] Processing openaicompatible provider:', {
        jwtApiKey: config.openAICompatibleApiKey ? 'Present' : 'Missing',
        jwtApiProxy: config.openAICompatibleApiProxy ? 'Present' : 'Missing',
        fallbackApiKey: config.apiKey ? 'Present' : 'Missing',
        fallbackApiProxy: config.apiProxy ? 'Present' : 'Missing',
        envUrl: process.env.OPENAI_COMPATIBLE_API_BASE_URL ? 'Present' : 'Missing'
      });
      
      apiKey = config.openAICompatibleApiKey || config.apiKey || getAIProviderApiKey(provider);
      apiProxy = config.openAICompatibleApiProxy || config.apiProxy;
      
      // openaicompatible需要特殊处理，因为默认环境变量可能为空
      if (!apiProxy) {
        const envUrl = process.env.OPENAI_COMPATIBLE_API_BASE_URL;
        console.log('[AI Config] No proxy in JWT config, checking env var:', envUrl || 'Not set');
        if (envUrl) {
          apiProxy = getEnvBaseURL(provider);
        }
      }
      break;
    case 'pollinations':
      apiKey = config.pollinationsApiKey || config.apiKey || getAIProviderApiKey(provider);
      apiProxy = config.pollinationsApiProxy || config.apiProxy || getEnvBaseURL(provider);
      break;
    case 'ollama':
      apiKey = config.ollamaApiKey || config.apiKey || getAIProviderApiKey(provider);
      apiProxy = config.ollamaApiProxy || config.apiProxy || getEnvBaseURL(provider);
      break;
    default:
      // 未知provider，使用通用配置
      apiKey = config.apiKey || getAIProviderApiKey(provider);
      apiProxy = config.apiProxy || getEnvBaseURL(provider);
  }
  
  console.log('[AI Config] Final AI configuration:', {
    provider,
    apiKey: apiKey ? `${apiKey.substring(0, 10)}...` : 'Not configured',
    apiProxy: apiProxy || 'Not configured',
    hasOtherConfig: Object.keys(config).length > 0
  });
  
  // 确保我们的 apiKey 和 apiProxy 不被 config 覆盖
  return { ...config, provider, apiKey, apiProxy };
}

/**
 * 获取搜索提供商的最终配置
 * 先从配置中获取searchProvider，然后根据searchProvider获取对应的配置
 * 优先级：JWT配置 > URL参数 > 环境变量
 */
export function getSearchProviderConfig(jwtConfig: UserConfig, req: NextRequest, defaultSearchProvider?: string) {
  console.log('[Search Config] Starting search provider configuration...');
  
  const config = getFinalConfig(jwtConfig, req);
  
  // 先获取searchProvider：URL参数 > JWT配置 > 传入的默认值
  const searchProvider = req.nextUrl.searchParams.get('searchProvider') || 
                         config.searchProvider || 
                         defaultSearchProvider || 
                         'tavily';
  
  console.log('[Search Config] Search provider selection:', {
    fromURL: req.nextUrl.searchParams.get('searchProvider'),
    fromJWT: config.searchProvider,
    defaultSearchProvider,
    selected: searchProvider
  });
  
  // 安全获取环境变量baseURL
  const getEnvSearchBaseURL = (provider: string) => {
    try {
      const baseURL = getSearchProviderBaseURL(provider);
      console.log(`[Search Config] Environment base URL for ${provider}:`, baseURL);
      return baseURL;
    } catch (error) {
      console.warn(`[Search Config] No base URL configured for search provider: ${provider}`);
      return '';
    }
  };
  
  // 根据searchProvider获取对应的配置
  let apiKey = '';
  let apiProxy = '';
  
  switch (searchProvider) {
    case 'tavily':
      apiKey = config.tavilyApiKey || config.searchApiKey || getSearchProviderApiKey(searchProvider);
      apiProxy = config.tavilyApiProxy || config.searchApiProxy || getEnvSearchBaseURL(searchProvider);
      break;
    case 'firecrawl':
      apiKey = config.firecrawlApiKey || config.searchApiKey || getSearchProviderApiKey(searchProvider);
      apiProxy = config.firecrawlApiProxy || config.searchApiProxy || getEnvSearchBaseURL(searchProvider);
      break;
    case 'exa':
      apiKey = config.exaApiKey || config.searchApiKey || getSearchProviderApiKey(searchProvider);
      apiProxy = config.exaApiProxy || config.searchApiProxy || getEnvSearchBaseURL(searchProvider);
      break;
    case 'bocha':
      apiKey = config.bochaApiKey || config.searchApiKey || getSearchProviderApiKey(searchProvider);
      apiProxy = config.bochaApiProxy || config.searchApiProxy || getEnvSearchBaseURL(searchProvider);
      break;
    case 'searxng':
      apiKey = config.searxngApiKey || config.searchApiKey || getSearchProviderApiKey(searchProvider);
      apiProxy = config.searxngApiProxy || config.searchApiProxy || getEnvSearchBaseURL(searchProvider);
      break;
    default:
      // 未知searchProvider，使用通用配置
      apiKey = config.searchApiKey || getSearchProviderApiKey(searchProvider);
      apiProxy = config.searchApiProxy || getEnvSearchBaseURL(searchProvider);
  }
  
  console.log('[Search Config] Final search configuration:', {
    searchProvider,
    apiKey: apiKey ? `${apiKey.substring(0, 10)}...` : 'Not configured',
    apiProxy: apiProxy || 'Not configured',
    hasOtherConfig: Object.keys(config).length > 0
  });
  
  // 确保我们的 apiKey 和 apiProxy 不被 config 覆盖
  return { ...config, searchProvider, apiKey, apiProxy };
}

/**
 * 合并用户配置和请求参数 - 保留向后兼容
 */
export function mergeConfigWithParams(config: UserConfig, req: NextRequest): UserConfig {
  return getFinalConfig(config, req);
}

// 导出接口类型
export type { UserConfig, JwtValidationResult };
