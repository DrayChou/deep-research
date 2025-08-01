import { NextResponse, type NextRequest } from "next/server";
import DeepResearch from "@/utils/deep-research";
import { multiApiKeyPolling } from "@/utils/model";
import { getProviderModelFields, hasValidApiKey, hasValidSearchApiKey } from "@/utils/provider-config";
import {
  optionalJwtAuthMiddleware,
  getAIProviderConfig,
  getSearchProviderConfig,
} from "../../utils";
import { logger } from "@/utils/logger";

// 创建 SSE API 专用的日志实例
const sseLogger = logger.getInstance('SSE-Live');

export const runtime = "edge";
export const dynamic = "force-dynamic";
export const preferredRegion = [
  "cle1",
  "iad1",
  "pdx1",
  "sfo1",
  "sin1",
  "syd1",
  "hnd1",
  "kix1",
];

export async function GET(req: NextRequest) {
  const requestLogger = logger.getInstance('SSE-Live');
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  requestLogger.info('New request', {
    requestId,
    url: req.url,
    searchParams: Object.fromEntries(req.nextUrl.searchParams.entries())
  });
  
  // 可选 JWT 验证和配置获取
  const authResult = await optionalJwtAuthMiddleware(req);
  if (!authResult.valid) {
    return NextResponse.json(
      { error: authResult.error || 'Authentication failed', code: 401 },
      { status: 401 }
    );
  }

  function getValueFromSearchParams(key: string) {
    return req.nextUrl.searchParams.get(key);
  }

  // 从 URL 参数获取基础参数
  const query = getValueFromSearchParams("query") || "";
  const language = getValueFromSearchParams("language") || "zh-CN";
  const maxResult = Number(getValueFromSearchParams("maxResult")) || 50;
  const enableCitationImage = getValueFromSearchParams("enableCitationImage") !== "false";
  const enableReferences = getValueFromSearchParams("enableReferences") !== "false";

  // 获取 AI 和搜索提供商配置，其中包含了 provider 信息
  const aiConfig = getAIProviderConfig(authResult.config || {}, req);
  const searchConfig = getSearchProviderConfig(authResult.config || {}, req);
  
  // 额外的安全检查，确保 provider 不为空
  if (!aiConfig.provider || aiConfig.provider.trim() === '') {
    sseLogger.error('AI provider is empty, this should not happen');
    return NextResponse.json(
      { error: 'AI provider configuration is missing', code: 500 },
      { status: 500 }
    );
  }
  
  if (!searchConfig.searchProvider || searchConfig.searchProvider.trim() === '') {
    sseLogger.error('Search provider is empty, this should not happen');
    return NextResponse.json(
      { error: 'Search provider configuration is missing', code: 500 },
      { status: 500 }
    );
  }

  // 根据 provider 从配置中获取对应的模型
  const config = authResult.config || {};
  const modelConfig = getProviderModelFields(aiConfig.provider, config);
  
  // 允许 URL 参数覆盖配置
  const thinkingModel = getValueFromSearchParams("thinkingModel") || modelConfig.thinkingModel || 'gpt-4o';
  const taskModel = getValueFromSearchParams("taskModel") || modelConfig.networkingModel || 'gpt-4o';

  // 添加简化的配置调试日志
  sseLogger.info('Configuration', {
    aiProvider: aiConfig.provider,
    searchProvider: searchConfig.searchProvider,
    models: modelConfig
  });


  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    start: async (controller) => {
      sseLogger.info("Client connected");

      req.signal.addEventListener("abort", () => {
        sseLogger.info("Client disconnected");
      });

      // 使用之前已经获取的配置，避免重复获取导致 API Key 丢失
      // const aiConfig = getAIProviderConfig(authResult.config || {}, req);
      // const searchConfig = getSearchProviderConfig(authResult.config || {}, req);

      sseLogger.info('DeepResearch initialization parameters', {
        language,
        query: query ? `${query.substring(0, 50)}...` : 'Empty',
        aiProvider: {
          provider: aiConfig.provider,
          baseURL: aiConfig.apiProxy || 'Not configured',
          hasApiKey: hasValidApiKey(aiConfig.provider, config),
          thinkingModel,
          taskModel
        },
        searchProvider: {
          provider: searchConfig.searchProvider,
          baseURL: searchConfig.apiProxy || 'Not configured',
          hasApiKey: hasValidSearchApiKey(searchConfig.searchProvider, config),
          maxResult
        },
        options: {
          enableCitationImage,
          enableReferences
        }
      });

      const processedApiKey = multiApiKeyPolling(aiConfig.apiKey);
      // 不在这里预处理搜索 API key，将原始的多 key 字符串传递给 DeepResearch
      // 让 DeepResearch 内部处理 key 的选择和轮换
      
      // 使用日志记录搜索配置状态
      sseLogger.debug('Search configuration processed', {
        hasApiKey: !!searchConfig.apiKey,
        searchKeyCount: searchConfig.apiKey ? searchConfig.apiKey.split(',').length : 0,
        searchProvider: searchConfig.searchProvider
      });

      const deepResearch = new DeepResearch({
        language,
        AIProvider: {
          baseURL: aiConfig.apiProxy,
          apiKey: processedApiKey,
          provider: aiConfig.provider,
          thinkingModel,
          taskModel,
        },
        searchProvider: {
          baseURL: searchConfig.apiProxy,
          apiKey: searchConfig.apiKey, // 传递原始的多 key 字符串
          provider: searchConfig.searchProvider,
          maxResult,
        },
        onMessage: (event, data) => {
          if (event === "message") {
            controller.enqueue(encoder.encode(data.text));
          } else if (event === "progress") {
            sseLogger.debug(
              `[${data.step}]: ${data.name ? `"${data.name}" ` : ""}${
                data.status
              }`
            );
            if (data.step === "final-report" && data.status === "end") {
              controller.close();
            }
          } else if (event === "error") {
            console.error(data);
            controller.close();
          }
        },
      });

      req.signal.addEventListener("abort", () => {
        controller.close();
      });

      try {
        await deepResearch.start(query, enableCitationImage, enableReferences);
      } catch (err) {
        const errorDetails = {
          requestId,
          error: err instanceof Error ? err.message : "Unknown error",
          stack: err instanceof Error ? err.stack : undefined,
          query: query ? query.substring(0, 100) : 'Empty',
          aiProvider: aiConfig.provider,
          searchProvider: searchConfig.searchProvider,
          thinkingModel,
          taskModel,
          timestamp: new Date().toISOString()
        };
        
        requestLogger.error('Deep research execution failed', err instanceof Error ? err : undefined, errorDetails);
        
        // 发送错误信息到客户端
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        const errorPayload = {
          type: 'error',
          message: errorMessage,
          details: errorDetails,
          timestamp: new Date().toISOString(),
          requestId
        };
        
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorPayload)}\n\n`));
        
        // 延迟关闭连接，确保客户端收到错误信息
        setTimeout(() => {
          controller.close();
        }, 1000);
        
        return;
      }
      controller.close();
    },
  });

  return new NextResponse(readableStream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": "*",

      // 响应标题里输出当前使用的模型名称和请求 ID
      "X-Model-Name": `${aiConfig.provider} (${thinkingModel}, ${taskModel})`,
      "X-Search-Provider": searchConfig.searchProvider || "Not configured",
      "X-Request-ID": requestId,
    },
  });
}
