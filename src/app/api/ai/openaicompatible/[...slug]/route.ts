import { NextResponse, type NextRequest } from "next/server";
import { optionalJwtAuthMiddleware, getAIProviderConfig } from "@/app/api/utils";

export const runtime = "edge";
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

async function handler(req: NextRequest) {
  try {
    // 验证JWT并获取用户配置
    const authResult = await optionalJwtAuthMiddleware(req);
    
    // 获取AI提供商配置
    const aiConfig = getAIProviderConfig(authResult.config || {}, req, 'openaicompatible');
    
    // 使用用户配置中的apiProxy，如果没有则使用环境变量
    const apiProxy = aiConfig.apiProxy || process.env.OPENAI_COMPATIBLE_API_BASE_URL || "";
    
    if (!apiProxy) {
      return NextResponse.json(
        { code: 500, message: "No API proxy configured for openaicompatible provider" },
        { status: 500 }
      );
    }
    
    let body;
    if (req.method.toUpperCase() !== "GET") {
      body = await req.json();
    }
    const searchParams = req.nextUrl.searchParams;
    const path = searchParams.getAll("slug");
    searchParams.delete("slug");
    const params = searchParams.toString();

    // 构建请求URL
    let url = `${apiProxy}/${decodeURIComponent(path.join("/"))}`;
    if (params) url += `?${params}`;
    
    const payload: RequestInit = {
      method: req.method,
      headers: {
        "Content-Type": req.headers.get("Content-Type") || "application/json",
        Authorization: req.headers.get("Authorization") || "",
      },
    };
    if (body) payload.body = JSON.stringify(body);
    
    console.log(`[openaicompatible] Forwarding request to:`, url);
    
    const response = await fetch(url, payload);
    return new NextResponse(response.body, response);
  } catch (error) {
    if (error instanceof Error) {
      console.error("[openaicompatible] Error:", error instanceof Error ? error : new Error(String(error)));
      return NextResponse.json(
        { code: 500, message: error.message },
        { status: 500 }
      );
    }
  }
}

export { handler as GET, handler as POST, handler as PUT, handler as DELETE };
