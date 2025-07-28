import { NextResponse, type NextRequest } from "next/server";
import DeepResearch from "@/utils/deep-research";
import { multiApiKeyPolling } from "@/utils/model";
import { getProviderModelFields, hasValidApiKey, hasValidSearchApiKey } from "@/utils/provider-config";
import {
  optionalJwtAuthMiddleware,
  getAIProviderConfig,
  getSearchProviderConfig,
} from "../../utils";

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
  console.log('\n=== [SSE Live] New request ===');
  console.log('[SSE Live] Request URL:', req.url);
  console.log('[SSE Live] URL search params:', Object.fromEntries(req.nextUrl.searchParams.entries()));
  
  // 可选JWT验证和配置获取
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

  // 从URL参数获取基础参数
  const query = getValueFromSearchParams("query") || "";
  const language = getValueFromSearchParams("language") || "zh-CN";
  const maxResult = Number(getValueFromSearchParams("maxResult")) || 50;
  const enableCitationImage = getValueFromSearchParams("enableCitationImage") !== "false";
  const enableReferences = getValueFromSearchParams("enableReferences") !== "false";

  // 获取AI和搜索提供商配置，其中包含了provider信息
  const aiConfig = getAIProviderConfig(authResult.config || {}, req);
  const searchConfig = getSearchProviderConfig(authResult.config || {}, req);
  
  // 额外的安全检查，确保provider不为空
  if (!aiConfig.provider || aiConfig.provider.trim() === '') {
    console.error('[SSE Live] AI provider is empty, this should not happen');
    return NextResponse.json(
      { error: 'AI provider configuration is missing', code: 500 },
      { status: 500 }
    );
  }
  
  if (!searchConfig.searchProvider || searchConfig.searchProvider.trim() === '') {
    console.error('[SSE Live] Search provider is empty, this should not happen');
    return NextResponse.json(
      { error: 'Search provider configuration is missing', code: 500 },
      { status: 500 }
    );
  }

  // 根据 provider 从配置中获取对应的模型
  const config = authResult.config || {};
  const modelConfig = getProviderModelFields(aiConfig.provider, config);
  
  // 允许URL参数覆盖配置
  const thinkingModel = getValueFromSearchParams("thinkingModel") || modelConfig.thinkingModel || 'gpt-4o';
  const taskModel = getValueFromSearchParams("taskModel") || modelConfig.networkingModel || 'gpt-4o';

  // 添加简化的配置调试日志
  console.log('[SSE Live] Configuration:', {
    aiProvider: aiConfig.provider,
    searchProvider: searchConfig.searchProvider,
    models: modelConfig
  });


  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    start: async (controller) => {
      console.log("Client connected");

      req.signal.addEventListener("abort", () => {
        console.log("Client disconnected");
      });

      // 使用之前已经获取的配置，避免重复获取导致 API Key 丢失
      // const aiConfig = getAIProviderConfig(authResult.config || {}, req);
      // const searchConfig = getSearchProviderConfig(authResult.config || {}, req);

      console.log('[SSE Live] DeepResearch initialization parameters:', {
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
      const processedSearchApiKey = multiApiKeyPolling(searchConfig.apiKey);
      
      // 临时调试：检查搜索配置传递
      console.log('[SSE Live] Search Config Debug:', {
        searchConfigApiKey: searchConfig.apiKey ? `${searchConfig.apiKey.substring(0, 15)}...` : 'Missing',
        processedSearchApiKey: processedSearchApiKey ? `${processedSearchApiKey.substring(0, 15)}...` : 'Missing',
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
          apiKey: processedSearchApiKey,
          provider: searchConfig.searchProvider,
          maxResult,
        },
        onMessage: (event, data) => {
          if (event === "message") {
            controller.enqueue(encoder.encode(data.text));
          } else if (event === "progress") {
            console.log(
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
        throw new Error(err instanceof Error ? err.message : "Unknown error");
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
    },
  });
}
