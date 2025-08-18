import { completePath } from "@/utils/url";
import { NextRequest } from "next/server";
import { parseJWT, isJWTExpired, isValidJWTFormat } from "@/utils/jwt";
import { logger } from "@/utils/logger";

// 创建API工具专用的日志实例
const apiLogger = logger.getInstance('API-Utils');

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
      console.warn("Unsupported AI Provider:", provider, "- falling back to openaicompatible");
      return completePath(OPENAI_COMPATIBLE_API_BASE_URL, "/v1");
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
      console.warn("Unsupported AI Provider:", provider, "- returning empty API key");
      return "";
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
      console.warn("Unsupported Search Provider:", provider, "- falling back to tavily");
      return TAVILY_API_BASE_URL;
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
      console.warn("Unsupported Search Provider:", provider, "- returning empty API key");
      return "";
  }
}

/**
 * 从请求中推断数据中心URL
 * 优先级：URL参数 > 环境变量 > 从请求路径推断 > 从headers推断
 */
export function inferDataBaseUrlFromRequest(req: NextRequest): string {
  // 1. 优先从URL参数中获取
  const dataBaseUrlFromParams = req.nextUrl.searchParams.get('dataBaseUrl');
  if (dataBaseUrlFromParams) {
    apiLogger.info('Found from URL params', dataBaseUrlFromParams);
    return dataBaseUrlFromParams;
  }

  // 2. 从环境变量获取
  const dataBaseUrlFromEnv = process.env.NEXT_PUBLIC_DATA_CENTER_URL;
  if (dataBaseUrlFromEnv) {
    apiLogger.info('Found from environment variable', dataBaseUrlFromEnv);
    return dataBaseUrlFromEnv;
  }

  // 3. 从请求路径推断
  const pathname = req.nextUrl.pathname;
  apiLogger.debug('Request pathname', pathname);
  
  // 检查是否是 dp2api 路径格式：/dp2api/api/xxx
  if (pathname.startsWith('/dp2api/')) {
    // 从 headers 中获取原始请求的 host 和协议
    const host = req.headers.get('host') || req.headers.get('x-forwarded-host') || 'localhost:8080';
    const protocol = req.headers.get('x-forwarded-proto') || 
                    req.headers.get('x-forwarded-protocol') || 
                    (host.includes('localhost') ? 'http' : 'https');
    
    const inferredUrl = `${protocol}://${host}`;
    apiLogger.debug('Inferred from dp2api path', {
      pathname,
      host,
      protocol,
      inferredUrl
    });
    return inferredUrl;
  }

  // 4. 从其他 headers 推断（如果有代理）
  const forwardedHost = req.headers.get('x-forwarded-host');
  const forwardedProto = req.headers.get('x-forwarded-proto');
  if (forwardedHost && forwardedProto) {
    const inferredUrl = `${forwardedProto}://${forwardedHost}`;
    apiLogger.debug('Inferred from forwarded headers', inferredUrl);
    return inferredUrl;
  }

  // 5. 默认回退
  const defaultUrl = 'http://localhost:8080';
  apiLogger.debug('Using default fallback', defaultUrl);
  return defaultUrl;
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

    apiLogger.info('Fetching system-configs from', apiUrl);
    apiLogger.debug('Using JWT', `${jwt.substring(0, 20)}...`);

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt}`,
      },
    });

    apiLogger.debug('System-configs response status', response.status);

    if (!response.ok) {
      // 获取详细的错误信息
      let responseText = '';
      try {
        responseText = await response.text();
        apiLogger.debug('Error response body', responseText);
      } catch {
        apiLogger.debug('Could not read error response body');
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
      
      apiLogger.error('System-configs fetch failed', undefined, {
        status: response.status,
        statusText: response.statusText,
        error: errorMessage,
        responseBody: responseText
      });
      return { valid: false, error: errorMessage };
    }

    const responseData = await response.json();
    apiLogger.debug('System-configs response received', {
      hasResponse: !!responseData,
      responseCode: responseData?.code,
      responseMessage: responseData?.message,
      dataLength: responseData?.data?.length || 0
    });
    
    // 处理API返回的数据结构，将数组转换为键值对对象
    const configData: UserConfig = {};
    if (responseData?.code === 200 && responseData?.data && Array.isArray(responseData.data)) {
      responseData.data.forEach((item: any) => {
        if (item.key && item.value !== undefined) {
          configData[item.key] = item.value;
        }
      });
      apiLogger.info('Config loaded', {
        provider: configData.provider,
        searchProvider: configData.searchProvider,
        configCount: Object.keys(configData).length
      });
    } else {
      apiLogger.warn('Invalid system-configs response format');
    }
    
    return {
      valid: true,
      userId,
      username,
      config: configData
    };

  } catch (error) {
    apiLogger.error('Validation and config query failed', error instanceof Error ? error : undefined);
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
  apiLogger.info('Starting optional JWT authentication...');
  
  // 从请求中提取JWT
  const jwt = extractJwtFromRequest(req);
  
  // 如果没有提供JWT，返回有效但空配置的结果
  if (!jwt) {
    apiLogger.info('No JWT provided, using default configuration');
    return { 
      valid: true, 
      config: {},
      userId: undefined,
      username: undefined
    };
  }

  apiLogger.info('JWT found, validating and fetching config...');
  
  // 智能推断数据中心URL
  const dataBaseUrl = inferDataBaseUrlFromRequest(req);

  apiLogger.info('Data center URL', dataBaseUrl);

  // 验证JWT并获取配置
  const result = await validateJwtAndGetConfig(jwt, dataBaseUrl);
  
  if (result.valid && result.config) {
    apiLogger.info('Configuration loaded successfully', {
      userId: result.userId,
      username: result.username,
      configCount: Object.keys(result.config || {}).length
    });
  } else {
    apiLogger.error('Failed to load configuration', undefined, { error: result.error });
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

  // 智能推断数据中心URL
  const dataBaseUrl = inferDataBaseUrlFromRequest(req);

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
  req: NextRequest
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
 * 两种模式：
 * 1. JWT模式：有JWT时完全使用JWT配置，不考虑URL参数
 * 2. 老参数模式：无JWT时使用URL参数+环境变量，必须有有效的provider参数
 */
export function getAIProviderConfig(jwtConfig: UserConfig, req: NextRequest, defaultProvider?: string) {
  console.log('[AI Config] Starting AI provider configuration...');
  
  // 检查是否有JWT配置（通过检查jwtConfig是否为空对象）
  const hasJwtConfig = Object.keys(jwtConfig).length > 0;
  console.log('[AI Config] JWT Config present:', hasJwtConfig);
  
  let provider: string;
  let apiKey: string;
  let apiProxy: string;
  
  if (hasJwtConfig) {
    // 模式1：有JWT配置，完全使用JWT配置，不考虑URL参数
    const config = getFinalConfig(jwtConfig, req);
    
    provider = config.provider || defaultProvider || 'openaicompatible';
    
    // 确保provider不为空字符串或null
    if (!provider || provider.trim() === '') {
      console.warn('[AI Config] Empty provider in JWT config, using openaicompatible as fallback');
      provider = 'openaicompatible';
    }
    
    // 额外的安全检查，确保provider不是空白字符串
    provider = provider.trim();
    if (provider === '') {
      console.warn('[AI Config] Provider is empty after trimming, forcing openaicompatible');
      provider = 'openaicompatible';
    }
    
    console.log('[AI Config] JWT mode - using JWT configuration only:', {
      jwtProvider: config.provider,
      defaultProvider,
      selected: provider
    });
  } else {
    // 模式2：没有JWT配置，使用URL参数+环境变量模式
    const urlProvider = req.nextUrl.searchParams.get('provider');
    
    if (!urlProvider || urlProvider.trim() === '') {
      // 既没有JWT也没有有效的URL参数，这是无效状态
      throw new Error('No valid configuration found. Either provide JWT token or URL parameters with environment variables.');
    }
    
    provider = urlProvider;
    
    console.log('[AI Config] Legacy mode - using URL parameters + ENV variables:', {
      urlProvider: provider
    });
  }
  
  // 安全获取环境变量baseURL
  const getEnvBaseURL = (provider: string) => {
    try {
      const baseURL = getAIProviderBaseURL(provider);
      console.log(`[AI Config] Environment base URL for ${provider}:`, baseURL);
      return baseURL;
    } catch {
      console.warn(`[AI Config] No base URL configured for provider: ${provider}`);
      return '';
    }
  };
  
  if (hasJwtConfig) {
    // 模式1：有JWT配置，完全使用JWT配置
    const config = getFinalConfig(jwtConfig, req);
    
    switch (provider) {
      case 'google':
        apiKey = config.googleApiKey || config.apiKey || '';
        apiProxy = config.googleApiProxy || config.apiProxy || '';
        break;
      case 'openai':
        apiKey = config.openAIApiKey || config.apiKey || '';
        apiProxy = config.openAIApiProxy || config.apiProxy || '';
        break;
      case 'anthropic':
        apiKey = config.anthropicApiKey || config.apiKey || '';
        apiProxy = config.anthropicApiProxy || config.apiProxy || '';
        break;
      case 'deepseek':
        apiKey = config.deepseekApiKey || config.apiKey || '';
        apiProxy = config.deepseekApiProxy || config.apiProxy || '';
        break;
      case 'openrouter':
        apiKey = config.openRouterApiKey || config.apiKey || '';
        apiProxy = config.openRouterApiProxy || config.apiProxy || '';
        break;
      case 'xai':
        apiKey = config.xAIApiKey || config.apiKey || '';
        apiProxy = config.xAIApiProxy || config.apiProxy || '';
        break;
      case 'mistral':
        apiKey = config.mistralApiKey || config.apiKey || '';
        apiProxy = config.mistralApiProxy || config.apiProxy || '';
        break;
      case 'azure':
        apiKey = config.azureApiKey || config.apiKey || '';
        apiProxy = config.azureApiProxy || config.apiProxy || '';
        break;
      case 'openaicompatible':
        console.log('[AI Config] Processing openaicompatible provider (JWT mode):', {
          jwtApiKey: config.openAICompatibleApiKey ? 'Present' : 'Missing',
          jwtApiProxy: config.openAICompatibleApiProxy ? 'Present' : 'Missing',
          fallbackApiKey: config.apiKey ? 'Present' : 'Missing',
          fallbackApiProxy: config.apiProxy ? 'Present' : 'Missing'
        });
        
        apiKey = config.openAICompatibleApiKey || config.apiKey || '';
        apiProxy = config.openAICompatibleApiProxy || config.apiProxy || '';
        break;
      case 'pollinations':
        apiKey = config.pollinationsApiKey || config.apiKey || '';
        apiProxy = config.pollinationsApiProxy || config.apiProxy || '';
        break;
      case 'ollama':
        apiKey = config.ollamaApiKey || config.apiKey || '';
        apiProxy = config.ollamaApiProxy || config.apiProxy || '';
        break;
      default:
        // 未知provider，使用通用配置
        apiKey = config.apiKey || '';
        apiProxy = config.apiProxy || '';
    }
    
    // JWT模式下，检查关键配置是否缺失
    if (!apiKey && ['google', 'openai', 'anthropic', 'deepseek', 'openrouter', 'xai', 'mistral', 'azure', 'openaicompatible'].includes(provider)) {
      console.warn(`[AI Config] JWT mode: Missing API key for provider ${provider}`);
    }
    if (!apiProxy && provider !== 'pollinations' && provider !== 'ollama') {
      console.warn(`[AI Config] JWT mode: Missing API proxy for provider ${provider}`);
    }
  } else {
    // 模式2：没有JWT配置，完全依赖环境变量（URL参数指定provider，env提供apiKey和baseURL）
    apiKey = getAIProviderApiKey(provider);
    apiProxy = getEnvBaseURL(provider);
    
    console.log('[AI Config] Legacy mode (URL params + ENV):', {
      provider: provider,
      envApiKey: apiKey ? 'Present' : 'Missing',
      envApiProxy: apiProxy ? 'Present' : 'Missing'
    });
    
    // 老参数模式下，检查环境变量是否配置正确
    if (!apiKey && ['google', 'openai', 'anthropic', 'deepseek', 'openrouter', 'xai', 'mistral', 'azure', 'openaicompatible'].includes(provider)) {
      throw new Error(`Legacy mode: Missing environment variable API key for provider ${provider}. Please check your .env configuration.`);
    }
    if (!apiProxy && provider !== 'pollinations' && provider !== 'ollama') {
      throw new Error(`Legacy mode: Missing environment variable API base URL for provider ${provider}. Please check your .env configuration.`);
    }
  }
  
  console.log('[AI Config] Final AI configuration:', {
    provider,
    apiKey: apiKey ? `${apiKey.substring(0, 10)}...` : 'Not configured',
    apiProxy: apiProxy || 'Not configured',
    hasJwtConfig
  });
  
  if (hasJwtConfig) {
    // 有JWT配置，返回合并后的配置
    const config = getFinalConfig(jwtConfig, req);
    return { ...config, provider, apiKey, apiProxy };
  } else {
    // 没有JWT配置，只返回基本的配置
    return { provider, apiKey, apiProxy };
  }
}

/**
 * 获取搜索提供商的最终配置
 * 两种模式：
 * 1. JWT模式：有JWT时完全使用JWT配置，不考虑URL参数
 * 2. 老参数模式：无JWT时使用URL参数+环境变量，必须有有效的searchProvider参数
 */
export function getSearchProviderConfig(jwtConfig: UserConfig, req: NextRequest, defaultSearchProvider?: string) {
  console.log('[Search Config] Starting search provider configuration...');
  
  // 检查是否有JWT配置
  const hasJwtConfig = Object.keys(jwtConfig).length > 0;
  console.log('[Search Config] JWT Config present:', hasJwtConfig);
  
  let searchProvider: string;
  let apiKey: string;
  let apiProxy: string;
  
  if (hasJwtConfig) {
    // 模式1：有JWT配置，完全使用JWT配置，不考虑URL参数
    const config = getFinalConfig(jwtConfig, req);
    
    searchProvider = config.searchProvider || defaultSearchProvider || 'tavily';
    
    // 确保 searchProvider 不为空字符串或 null
    if (!searchProvider || searchProvider.trim() === '') {
      console.warn('[Search Config] Empty search provider in JWT config, using tavily as fallback');
      searchProvider = 'tavily';
    }
    
    // 额外的安全检查，确保 searchProvider 不是空白字符串
    searchProvider = searchProvider.trim();
    if (searchProvider === '') {
      console.warn('[Search Config] Search provider is empty after trimming, forcing tavily');
      searchProvider = 'tavily';
    }
    
    console.log('[Search Config] JWT mode - using JWT configuration only:', {
      jwtSearchProvider: config.searchProvider,
      defaultSearchProvider,
      selected: searchProvider
    });
  } else {
    // 模式 2：没有 JWT 配置，使用 URL 参数 + 环境变量模式
    const urlSearchProvider = req.nextUrl.searchParams.get('searchProvider');
    
    if (!urlSearchProvider || urlSearchProvider.trim() === '') {
      // 既没有 JWT 也没有有效的 URL 参数，这是无效状态
      throw new Error('No valid search configuration found. Either provide JWT token or URL parameters with environment variables.');
    }
    
    searchProvider = urlSearchProvider;
    
    console.log('[Search Config] Legacy mode - using URL parameters + ENV variables:', {
      urlSearchProvider: searchProvider
    });
  }
  
  // 安全获取环境变量 baseURL
  const getEnvSearchBaseURL = (provider: string) => {
    try {
      const baseURL = getSearchProviderBaseURL(provider);
      console.log(`[Search Config] Environment base URL for ${provider}:`, baseURL);
      return baseURL;
    } catch {
      console.warn(`[Search Config] No base URL configured for search provider: ${provider}`);
      return '';
    }
  };
  
  if (hasJwtConfig) {
    // 模式 1：有 JWT 配置，但需要和环境变量合并
    const config = getFinalConfig(jwtConfig, req);
    
    // 获取 JWT 配置的 key
    let jwtApiKey = '';
    switch (searchProvider) {
      case 'tavily':
        jwtApiKey = config.tavilyApiKey || config.searchApiKey || '';
        apiProxy = config.tavilyApiProxy || config.searchApiProxy || '';
        break;
      case 'firecrawl':
        jwtApiKey = config.firecrawlApiKey || config.searchApiKey || '';
        apiProxy = config.firecrawlApiProxy || config.searchApiProxy || '';
        break;
      case 'exa':
        jwtApiKey = config.exaApiKey || config.searchApiKey || '';
        apiProxy = config.exaApiProxy || config.searchApiProxy || '';
        break;
      case 'bocha':
        jwtApiKey = config.bochaApiKey || config.searchApiKey || '';
        apiProxy = config.bochaApiProxy || config.searchApiProxy || '';
        break;
      case 'searxng':
        jwtApiKey = config.searxngApiKey || config.searchApiKey || '';
        apiProxy = config.searxngApiProxy || config.searchApiProxy || '';
        break;
      case 'model':
        // model 模式不需要 API key 和 proxy
        jwtApiKey = '';
        apiProxy = '';
        break;
      default:
        // 未知 searchProvider，使用通用配置
        jwtApiKey = config.searchApiKey || '';
        apiProxy = config.searchApiProxy || '';
    }
    
    // 获取环境变量中的 key 作为补充
    const envApiKey = getSearchProviderApiKey(searchProvider);
    
    // 合并 JWT 和环境变量的 key，去重
    apiKey = mergeAndDeduplicateKeys(jwtApiKey, envApiKey);
    
    console.log('[Search Config] JWT + ENV merged keys:', {
      searchProvider,
      jwtKeyCount: jwtApiKey ? jwtApiKey.split(',').length : 0,
      envKeyCount: envApiKey ? envApiKey.split(',').length : 0,
      mergedKeyCount: apiKey ? apiKey.split(',').length : 0,
      jwtKeys: jwtApiKey ? jwtApiKey.split(',').map(k => k.substring(0, 8) + '...') : [],
      envKeys: envApiKey ? envApiKey.split(',').map(k => k.substring(0, 8) + '...') : [],
      mergedKeys: apiKey ? apiKey.split(',').map(k => k.substring(0, 8) + '...') : []
    });
    
    // JWT 模式下，检查关键配置是否缺失
    if (!apiKey && ['tavily', 'firecrawl', 'exa', 'bocha'].includes(searchProvider)) {
      console.warn(`[Search Config] JWT mode: Missing API key for search provider ${searchProvider}`);
    }
    if (!apiProxy && ['tavily', 'firecrawl', 'exa', 'bocha', 'searxng'].includes(searchProvider)) {
      console.warn(`[Search Config] JWT mode: Missing API proxy for search provider ${searchProvider}`);
    }
  } else {
    // 模式 2：没有 JWT 配置，完全依赖环境变量（URL 参数指定 searchProvider，env 提供 apiKey 和 baseURL）
    apiKey = getSearchProviderApiKey(searchProvider);
    apiProxy = getEnvSearchBaseURL(searchProvider);
    
    console.log('[Search Config] Legacy mode (URL params + ENV):', {
      searchProvider: searchProvider,
      envSearchApiKey: apiKey ? 'Present' : 'Missing',
      envSearchApiProxy: apiProxy ? 'Present' : 'Missing'
    });
    
    // 老参数模式下，检查环境变量是否配置正确
    if (!apiKey && ['tavily', 'firecrawl', 'exa', 'bocha'].includes(searchProvider)) {
      throw new Error(`Legacy mode: Missing environment variable API key for search provider ${searchProvider}. Please check your .env configuration.`);
    }
    if (!apiProxy && ['tavily', 'firecrawl', 'exa', 'bocha', 'searxng'].includes(searchProvider)) {
      throw new Error(`Legacy mode: Missing environment variable API base URL for search provider ${searchProvider}. Please check your .env configuration.`);
    }
  }
  
  console.log('[Search Config] Final search configuration:', {
    searchProvider,
    apiKey: apiKey ? `${apiKey.substring(0, 10)}...` : 'Not configured',
    apiProxy: apiProxy || 'Not configured',
    hasJwtConfig
  });
  
  if (hasJwtConfig) {
    // 有 JWT 配置，返回合并后的配置
    const config = getFinalConfig(jwtConfig, req);
    return { ...config, searchProvider, apiKey, apiProxy };
  } else {
    // 没有 JWT 配置，只返回基本的配置
    return { searchProvider, apiKey, apiProxy };
  }
}

/**
 * 合并和去重 API keys
 * 将 JWT 配置的 key 和环境变量的 key 合并，并去重
 */
function mergeAndDeduplicateKeys(jwtKeys: string, envKeys: string): string {
  const allKeys: string[] = [];
  
  // 添加 JWT 配置的 key (优先级更高，放在前面)
  if (jwtKeys && jwtKeys.trim()) {
    const jwtKeyList = jwtKeys.split(',')
      .map(k => k.trim())
      .filter(k => k && k.length > 0)
      .filter(k => k !== 'undefined' && k !== 'null'); // 过滤无效值
    allKeys.push(...jwtKeyList);
  }
  
  // 添加环境变量的 key (作为补充)
  if (envKeys && envKeys.trim()) {
    const envKeyList = envKeys.split(',')
      .map(k => k.trim())
      .filter(k => k && k.length > 0)
      .filter(k => k !== 'undefined' && k !== 'null'); // 过滤无效值
    allKeys.push(...envKeyList);
  }
  
  // 增强去重逻辑：基于完整key字符串去重，保持顺序
  const uniqueKeys = allKeys.filter((key, index, arr) => {
    // 只保留第一次出现的key，移除后续重复
    return arr.indexOf(key) === index;
  });
  
  // 验证key格式的基本检查（可选）
  const validKeys = uniqueKeys.filter(key => {
    // 基本格式检查：至少包含一些字符，不能全是特殊字符
    return key.length >= 3 && /[a-zA-Z0-9]/.test(key);
  });
  
  return validKeys.join(',');
}

/**
 * 合并用户配置和请求参数 - 保留向后兼容
 */
export function mergeConfigWithParams(config: UserConfig, req: NextRequest): UserConfig {
  return getFinalConfig(config, req);
}

// 导出接口类型
export type { UserConfig, JwtValidationResult };
