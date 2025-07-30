import {
  TAVILY_BASE_URL,
  FIRECRAWL_BASE_URL,
  EXA_BASE_URL,
  BOCHA_BASE_URL,
  SEARXNG_BASE_URL,
} from "@/constants/urls";
import { rewritingPrompt } from "@/constants/prompts";
import { completePath } from "@/utils/url";
import { pick, sort } from "radash";
import { logger } from "@/utils/logger";

// 创建搜索功能专用的日志实例
const searchLogger = logger.getInstance('DeepResearch-Search');

// 通用错误处理函数
async function handleSearchProviderError(
  provider: string,
  apiKey: string,
  response: Response
): Promise<void> {
  try {
    const { markApiKeyFailed } = await import('@/utils/model');
    if (apiKey && !response.ok) {
      // 根据状态码标记 key 失败
      markApiKeyFailed(apiKey, response.status);
      searchLogger.info(`Marked ${provider} API key as failed with status ${response.status}`);
    }
  } catch (importError) {
    searchLogger.warn(`Failed to import markApiKeyFailed for ${provider}`, importError);
  }
}

type TavilySearchResult = {
  title: string;
  url: string;
  content: string;
  rawContent?: string;
  score: number;
  publishedDate: string;
};

interface FirecrawlDocument<T = unknown> {
  url?: string;
  markdown?: string;
  html?: string;
  rawHtml?: string;
  links?: string[];
  extract?: T;
  json?: T;
  screenshot?: string;
  compare?: {
    previousScrapeAt: string | null;
    changeStatus: "new" | "same" | "changed" | "removed";
    visibility: "visible" | "hidden";
  };
  // v1 search only
  title?: string;
  description?: string;
}

type ExaSearchResult = {
  title: string;
  url: string;
  publishedDate: string;
  author: string;
  score: number;
  id: string;
  image?: string;
  favicon: string;
  text?: string;
  highlights?: string[];
  highlightScores?: number[];
  summary?: string;
  subpages?: ExaSearchResult[];
  extras?: {
    links?: string[];
    imageLinks?: string[];
  };
};

type BochaSearchResult = {
  id: string | null;
  name: string;
  url: string;
  displayUrl: string;
  snippet: string;
  summary?: string;
  siteName: string;
  siteIcon: string;
  dateLastCrawled: string;
  cachedPageUrl: string | null;
  language: string | null;
  isFamilyFriendly: boolean | null;
  isNavigational: boolean | null;
};

type BochaImage = {
  webSearchUrl: string;
  name: string;
  thumbnailUrl: string;
  datePublished: string;
  contentUrl: string;
  hostPageUrl: string;
  contentSize: number;
  encodingFormat: string;
  hostPageDisplayUrl: string;
  width: number;
  height: number;
  thumbnail: {
    width: number;
    height: number;
  };
};

type SearxngSearchResult = {
  url: string;
  title: string;
  content?: string;
  engine: string;
  parsed_url: string[];
  template: "default.html" | "videos.html" | "images.html";
  engines: string[];
  positions: number[];
  publishedDate?: Date | null;
  thumbnail?: null | string;
  is_onion?: boolean;
  score: number;
  category: string;
  length?: null | string;
  duration?: null | string;
  iframe_src?: string;
  source?: string;
  metadata?: string;
  resolution?: null | string;
  img_src?: string;
  thumbnail_src?: string;
  img_format?: "jpeg" | "Culture Snaxx" | "png";
};

export interface SearchProviderOptions {
  provider: string;
  baseURL?: string;
  apiKey?: string;
  query: string;
  maxResult?: number;
  scope?: string;
}

export async function createSearchProvider({
  provider,
  baseURL,
  apiKey = "",
  query,
  maxResult = 5,
  scope,
}: SearchProviderOptions) {
  // 建立key到provider的映射关系（仅在首次使用时）
  if (apiKey && provider) {
    try {
      const { buildKeyToProviderMap } = await import('@/utils/model');
      // 为所有可用的key建立映射，确保重试时能正确工作
      buildKeyToProviderMap(provider, apiKey);
      searchLogger.debug('已建立API key映射关系', {
        provider,
        keyPrefix: apiKey.substring(0, 8) + '...'
      });
    } catch (error) {
      searchLogger.warn('建立API key映射关系失败', error);
    }
  }

  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  if (provider === "tavily") {
    const searchUrl = `${completePath(baseURL || TAVILY_BASE_URL)}/search`;
    const requestBody = {
      query,
      search_depth: "advanced",
      topic: scope || "general",
      max_results: Number(maxResult),
      include_images: true,
      include_image_descriptions: true,
      include_answer: false,
      include_raw_content: true,
    };
    
    // 临时调试：检查请求详情
    searchLogger.debug('Tavily Request Details', {
      url: searchUrl,
      method: 'POST',
      headers: {
        ...headers,
        Authorization: headers.Authorization || 'Missing'
      },
      body: {
        query,
        max_results: Number(maxResult),
        search_depth: "advanced",
        include_raw_content: true,
        include_answer: false,
        include_domains: [],
        exclude_domains: [],
        include_images: true,
      }
    });
    
    const response = await fetch(searchUrl, {
      method: "POST",
      headers,
      credentials: "omit",
      body: JSON.stringify(requestBody),
    });
    
    // 临时调试：检查响应
    searchLogger.debug('Tavily Response', {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries())
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      searchLogger.debug('Tavily Error Response', errorText);
      
      // 使用通用错误处理函数
      await handleSearchProviderError('tavily', apiKey, response);
      
      throw new Error(`Tavily search failed: ${response.status} ${response.statusText}`);
    }
    const { results = [], images = [] } = await response.json();
    return {
      sources: (results as TavilySearchResult[])
        .filter((item) => item.content && item.url)
        .map((result) => {
          return {
            title: result.title,
            content: result.rawContent || result.content,
            url: result.url,
          };
        }) as Source[],
      images: images as ImageSource[],
    };
  } else if (provider === "firecrawl") {
    const response = await fetch(
      `${completePath(baseURL || FIRECRAWL_BASE_URL, "/v1")}/search`,
      {
        method: "POST",
        headers,
        credentials: "omit",
        body: JSON.stringify({
          query,
          limit: maxResult,
          tbs: "qdr:w",
          origin: "api",
          scrapeOptions: {
            formats: ["markdown"],
          },
          timeout: 60000,
        }),
      }
    );
    
    if (!response.ok) {
      await handleSearchProviderError('firecrawl', apiKey, response);
      throw new Error(`Firecrawl search failed: ${response.status} ${response.statusText}`);
    }
    
    const { data = [] } = await response.json();
    return {
      sources: (data as FirecrawlDocument[])
        .filter((item) => item.description && item.url)
        .map((result) => ({
          content: result.markdown || result.description,
          url: result.url,
          title: result.title,
        })) as Source[],
      images: [],
    };
  } else if (provider === "exa") {
    const response = await fetch(
      `${completePath(baseURL || EXA_BASE_URL)}/search`,
      {
        method: "POST",
        headers,
        credentials: "omit",
        body: JSON.stringify({
          query,
          category: scope || "research paper",
          contents: {
            text: true,
            summary: {
              query: `Given the following query from the user:\n<query>${query}</query>\n\n${rewritingPrompt}`,
            },
            numResults: Number(maxResult) * 5,
            livecrawl: "auto",
            extras: {
              imageLinks: 3,
            },
          },
        }),
      }
    );
    
    if (!response.ok) {
      await handleSearchProviderError('exa', apiKey, response);
      throw new Error(`Exa search failed: ${response.status} ${response.statusText}`);
    }
    
    const { results = [] } = await response.json();
    const images: ImageSource[] = [];
    return {
      sources: (results as ExaSearchResult[])
        .filter((item) => (item.summary || item.text) && item.url)
        .map((result) => {
          if (
            result.extras?.imageLinks &&
            result.extras?.imageLinks.length > 0
          ) {
            result.extras.imageLinks.forEach((url) => {
              images.push({ url, description: result.text });
            });
          }
          return {
            content: result.summary || result.text,
            url: result.url,
            title: result.title,
          };
        }) as Source[],
      images,
    };
  } else if (provider === "bocha") {
    const response = await fetch(
      `${completePath(baseURL || BOCHA_BASE_URL, "/v1")}/web-search`,
      {
        method: "POST",
        headers,
        credentials: "omit",
        body: JSON.stringify({
          query,
          freshness: "noLimit",
          summary: true,
          count: maxResult,
        }),
      }
    );
    
    if (!response.ok) {
      await handleSearchProviderError('bocha', apiKey, response);
      throw new Error(`Bocha search failed: ${response.status} ${response.statusText}`);
    }
    
    const { data = {} } = await response.json();
    const results = data.webPages?.value || [];
    const imageResults = data.images?.value || [];
    return {
      sources: (results as BochaSearchResult[])
        .filter((item) => item.snippet && item.url)
        .map((result) => ({
          content: result.summary || result.snippet,
          url: result.url,
          title: result.name,
        })) as Source[],
      images: (imageResults as BochaImage[]).map((item) => {
        const matchingResult = (results as BochaSearchResult[]).find(
          (result) => result.url === item.hostPageUrl
        );
        return {
          url: item.contentUrl,
          description: item.name || matchingResult?.name,
        };
      }) as ImageSource[],
    };
  } else if (provider === "searxng") {
    const params = {
      q: query,
      categories:
        scope === "academic" ? ["science", "images"] : ["general", "images"],
      engines:
        scope === "academic"
          ? [
              "arxiv",
              "google scholar",
              "pubmed",
              "wikispecies",
              "google_images",
            ]
          : [
              "google",
              "bing",
              "duckduckgo",
              "brave",
              "wikipedia",
              "bing_images",
              "google_images",
            ],
      lang: "auto",
      format: "json",
      autocomplete: "google",
    };
    const searchQuery = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      searchQuery.append(key, value.toString());
    }
    const local = global.location || {};
    const response = await fetch(
      `${completePath(
        baseURL || SEARXNG_BASE_URL
      )}/search?${searchQuery.toString()}`,
      baseURL?.startsWith(local.origin)
        ? { method: "POST", credentials: "omit", headers }
        : { method: "GET", credentials: "omit" }
    );
    
    if (!response.ok) {
      await handleSearchProviderError('searxng', apiKey, response);
      throw new Error(`SearXNG search failed: ${response.status} ${response.statusText}`);
    }
    
    const { results = [] } = await response.json();
    const rearrangedResults = sort(
      results as SearxngSearchResult[],
      (item) => item.score,
      true
    );
    return {
      sources: rearrangedResults
        .filter((item) => item.content && item.url && item.score >= 0.5)
        .slice(0, maxResult * 5)
        .map((result) => pick(result, ["title", "content", "url"])) as Source[],
      images: rearrangedResults
        .filter((item) => item.category === "images" && item.score >= 0.5)
        .slice(0, maxResult)
        .map((result) => {
          return {
            url: result.img_src,
            description: result.title,
          };
        }) as ImageSource[],
    };
  } else {
    searchLogger.warn("Unsupported Search Provider, falling back to model-based search", { provider });
    
    // 如果所有搜索提供商都不支持，返回空结果
    return {
      results: [],
      images: []
    };
  }
}
