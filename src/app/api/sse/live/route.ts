import { type NextRequest } from "next/server";
import { SSELiveHandler } from "./sse-handler";

// export const runtime = "edge"; // 禁用Edge Runtime以支持文件系统操作
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
  const handler = new SSELiveHandler(req);
  return handler.handleRequest();
}