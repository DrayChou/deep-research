import { NextResponse, type NextRequest } from "next/server";
import DeepResearch from "@/utils/deep-research";
import { multiApiKeyPolling } from "@/utils/model";
import { getProviderModelFields, hasValidApiKey } from "@/utils/provider-config";
import {
  optionalJwtAuthMiddleware,
  getAIProviderConfig,
  getSearchProviderConfig,
  type UserConfig,
} from "../utils";

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


export async function POST(req: NextRequest) {
  // 可选JWT验证和配置获取
  const authResult = await optionalJwtAuthMiddleware(req);
  if (!authResult.valid) {
    // JWT验证失败，返回未授权错误
    return NextResponse.json(
      { error: authResult.error || 'Authentication failed', code: 401 },
      { status: 401 }
    );
  }

  const requestBody = await req.json();
  
  // 从请求体中获取参数（这些参数可以覆盖配置中的值）
  const {
    query,
    provider: requestProvider,
    thinkingModel: requestThinkingModel,
    taskModel: requestTaskModel,
    searchProvider: requestSearchProvider,
    language = 'zh-CN',
    maxResult = 50,
    enableCitationImage = true,
    enableReferences = true,
  } = requestBody;

  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    start: async (controller) => {
      console.log("Client connected");
      controller.enqueue(
        encoder.encode(
          `event: infor\ndata: ${JSON.stringify({
            name: "deep-research",
            version: "0.1.0",
          })}\n\n`
        )
      );

      // 获取AI提供商和搜索提供商的最终配置
      const aiConfig = getAIProviderConfig(authResult.config || {}, req, requestProvider);
      const searchConfig = getSearchProviderConfig(authResult.config || {}, req, requestSearchProvider);

      // 根据 provider 从配置中获取对应的模型
      const config = authResult.config || {};
      const finalProvider = requestProvider || aiConfig.provider;
      
      // 获取 provider 对应的模型配置
      const modelConfig = getProviderModelFields(finalProvider, config);
      
      // 请求参数可以覆盖配置中的值
      const finalThinkingModel = requestThinkingModel || modelConfig.thinkingModel || 'gpt-4o';
      const finalTaskModel = requestTaskModel || modelConfig.networkingModel || 'gpt-4o';
      const finalSearchProvider = requestSearchProvider || searchConfig.searchProvider;

      console.log('[SSE API] Final configuration:', {
        provider: finalProvider,
        thinkingModel: finalThinkingModel,
        taskModel: finalTaskModel,
        searchProvider: finalSearchProvider,
        hasApiKey: hasValidApiKey(finalProvider, config),
        hasSearchApiKey: !!searchConfig.apiKey
      });

      const deepResearch = new DeepResearch({
        language,
        AIProvider: {
          baseURL: aiConfig.apiProxy,
          apiKey: multiApiKeyPolling(aiConfig.apiKey),
          provider: finalProvider,
          thinkingModel: finalThinkingModel,
          taskModel: finalTaskModel,
        },
        searchProvider: {
          baseURL: searchConfig.apiProxy,
          apiKey: multiApiKeyPolling(searchConfig.apiKey),
          provider: finalSearchProvider,
          maxResult,
        },
        onMessage: (event, data) => {
          if (event === "progress") {
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
          } else {
            console.warn(`Unknown event: ${event}`);
          }
          controller.enqueue(
            encoder.encode(
              `event: ${event}\ndata: ${JSON.stringify(data)})}\n\n`
            )
          );
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
