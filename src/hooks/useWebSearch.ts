import { useSettingStore } from "@/store/setting";
import {
  createSearchProvider,
  type SearchProviderOptions,
} from "@/utils/deep-research/search";
import { multiApiKeyPolling, markApiKeyFailed, getApiKeyStatusSummary, resetApiKeyStatus } from "@/utils/model";
import { generateSignature } from "@/utils/signature";

function useWebSearch() {
  async function search(query: string) {
    const { mode, searchProvider, searchMaxResult, accessPassword } =
      useSettingStore.getState();
    const options: SearchProviderOptions = {
      provider: searchProvider,
      maxResult: searchMaxResult,
      query,
    };

    switch (searchProvider) {
      case "tavily":
        const { tavilyApiKey, tavilyApiProxy, tavilyScope } =
          useSettingStore.getState();
        if (mode === "local") {
          options.baseURL = tavilyApiProxy;
          options.apiKey = multiApiKeyPolling(tavilyApiKey);
        } else {
          options.baseURL = location.origin + "/api/search/tavily";
        }
        options.scope = tavilyScope;
        break;
      case "firecrawl":
        const { firecrawlApiKey, firecrawlApiProxy } =
          useSettingStore.getState();
        if (mode === "local") {
          options.baseURL = firecrawlApiProxy;
          options.apiKey = multiApiKeyPolling(firecrawlApiKey);
        } else {
          options.baseURL = location.origin + "/api/search/firecrawl";
        }
        break;
      case "exa":
        const { exaApiKey, exaApiProxy, exaScope } = useSettingStore.getState();
        if (mode === "local") {
          options.baseURL = exaApiProxy;
          options.apiKey = multiApiKeyPolling(exaApiKey);
        } else {
          options.baseURL = location.origin + "/api/search/exa";
        }
        options.scope = exaScope;
        break;
      case "bocha":
        const { bochaApiKey, bochaApiProxy } = useSettingStore.getState();
        if (mode === "local") {
          options.baseURL = bochaApiProxy;
          options.apiKey = multiApiKeyPolling(bochaApiKey);
        } else {
          options.baseURL = location.origin + "/api/search/bocha";
        }
        break;
      case "searxng":
        const { searxngApiProxy, searxngScope } = useSettingStore.getState();
        if (mode === "local") {
          options.baseURL = searxngApiProxy;
        } else {
          options.baseURL = location.origin + "/api/search/searxng";
        }
        options.scope = searxngScope;
        break;
      default:
        break;
    }

    if (mode === "proxy") {
      options.apiKey = generateSignature(accessPassword, Date.now());
    }
    
    try {
      return await createSearchProvider(options);
    } catch (error) {
      // 如果是 key 相关的错误，标记当前 key 失败
      if (error instanceof Error) {
        const usedKey = options.apiKey;
        if (usedKey && mode === "local") {
          // 从错误信息中提取状态码
          let statusCode = 0;
          const errorMessage = error.message;
          
          // 使用正则表达式提取状态码
          const statusCodeMatch = errorMessage.match(/:\s*(\d{3})/);
          if (statusCodeMatch) {
            statusCode = parseInt(statusCodeMatch[1], 10);
          } else if (errorMessage.includes('432')) {
            statusCode = 432;
          } else if (errorMessage.includes('429')) {
            statusCode = 429;
          } else if (errorMessage.includes('401')) {
            statusCode = 401;
          } else if (errorMessage.includes('403')) {
            statusCode = 403;
          } else if (errorMessage.includes('500')) {
            statusCode = 500;
          } else if (errorMessage.includes('API key') || errorMessage.includes('No available API keys')) {
            statusCode = 401; // 默认为认证错误
          }
          
          markApiKeyFailed(usedKey, statusCode);
        }
      }
      throw error;
    }
  }

  return { search };
}

export default useWebSearch;
