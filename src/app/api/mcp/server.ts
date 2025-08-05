import { z } from "zod";
import { McpServer } from "@/libs/mcp-server/mcp";
import DeepResearch from "@/utils/deep-research";
import { multiApiKeyPolling } from "@/utils/model";
import {
  getAIProviderBaseURL,
  getAIProviderApiKey,
  getSearchProviderBaseURL,
  getSearchProviderApiKey,
} from "../utils";

const AI_PROVIDER = process.env.MCP_AI_PROVIDER || "";
const SEARCH_PROVIDER = process.env.MCP_SEARCH_PROVIDER || "model";
const THINKING_MODEL = process.env.MCP_THINKING_MODEL || "";
const TASK_MODEL = process.env.MCP_TASK_MODEL || "";

function initDeepResearchServer({
  language,
  maxResult,
}: {
  language?: string;
  maxResult?: number;
}) {
  const deepResearch = new DeepResearch({
    language,
    AIProvider: {
      baseURL: getAIProviderBaseURL(AI_PROVIDER),
      apiKey: multiApiKeyPolling(getAIProviderApiKey(AI_PROVIDER)),
      provider: AI_PROVIDER,
      thinkingModel: THINKING_MODEL,
      taskModel: TASK_MODEL,
    },
    searchProvider: {
      baseURL: getSearchProviderBaseURL(SEARCH_PROVIDER),
      apiKey: getSearchProviderApiKey(SEARCH_PROVIDER), // 传递原始的多key字符串，让DeepResearch内部处理
      provider: SEARCH_PROVIDER,
      maxResult,
    },
    onMessage: (event, data) => {
      if (event === "progress") {
        console.log(
          `[${data.step}]: ${data.name ? `"${data.name}" ` : ""}${data.status}`
        );
        if (data.status === "end" && data.data) {
          console.log(data.data);
        }
      } else if (event === "error") {
        console.error(data.message);
        throw new Error(data.message);
      }
    },
  });

  return deepResearch;
}

export function initMcpServer() {
  const deepResearchToolDescription =
    "Start deep research on any question, obtain and organize information through search engines, and generate research report.";
  const writeResearchPlanDescription =
    "Generate research plan based on user query.";
  const generateSERPQueryDescription =
    "Generate a list of data collection tasks based on the research plan.";
  const searchTaskDescription =
    "Generate SERP queries based on the research plan.";
  const writeFinalReportDescription =
    "Write a final research report based on the research plan and the results of the information collection tasks.";

  const server = new McpServer(
    {
      name: "deep-research",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {
          "deep-research": {
            description: deepResearchToolDescription,
          },
          "write-research-plan": {
            description: writeResearchPlanDescription,
          },
          "generate-SERP-query": {
            description: generateSERPQueryDescription,
          },
          "search-task": {
            description: searchTaskDescription,
          },
          "write-final-report": {
            description: writeFinalReportDescription,
          },
        },
      },
    }
  );

  server.tool(
    "deep-research",
    deepResearchToolDescription,
    {
      query: z.string().describe("The topic for deep research."),
      language: z
        .string()
        .optional()
        .describe("The final report text language."),
      maxResult: z
        .number()
        .optional()
        .default(5)
        .describe("Maximum number of search results."),
      enableCitationImage: z
        .boolean()
        .default(true)
        .optional()
        .describe(
          "Whether to include content-related images in the final report."
        ),
      enableReferences: z
        .boolean()
        .default(true)
        .optional()
        .describe(
          "Whether to include citation links in search results and final reports."
        ),
    },
    async (
      { query, language, maxResult, enableCitationImage, enableReferences },
      { signal }
    ) => {
      signal.addEventListener("abort", () => {
        throw new Error("The client closed unexpectedly!");
      });

      try {
        const deepResearch = initDeepResearchServer({
          language,
          maxResult,
        });
        const result = await deepResearch.start(
          query,
          enableCitationImage,
          enableReferences
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "write-research-plan",
    writeResearchPlanDescription,
    {
      query: z.string().describe("The topic for deep research."),
      language: z.string().optional().describe("The response Language."),
      maxRetries: z.number().optional().default(3).describe("Maximum number of retries if the generated plan is empty."),
    },
    async ({ query, language, maxRetries = 3 }, { signal }) => {
      signal.addEventListener("abort", () => {
        throw new Error("The client closed unexpectedly!");
      });

      const deepResearch = initDeepResearchServer({ language });
      let lastError: Error | null = null;

      // 重试机制：确保生成有效的研究计划
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`Generating research plan, attempt ${attempt}/${maxRetries}`);
          const result = await deepResearch.writeReportPlan(query);
          
          // 检查返回的计划是否为空
          if (!result || result.trim() === '') {
            const error = new Error(`Attempt ${attempt}: AI returned an empty research plan`);
            lastError = error;
            console.warn(error.message);
            
            // 如果不是最后一次尝试，继续重试
            if (attempt < maxRetries) {
              console.log(`Retrying in 1 second...`);
              await new Promise(resolve => setTimeout(resolve, 1000));
              continue;
            }
          } else {
            // 成功生成非空计划
            console.log(`Research plan generated successfully on attempt ${attempt}`);
            return {
              content: [
                { type: "text", text: JSON.stringify({ reportPlan: result, attempts: attempt }) },
              ],
            };
          }
        } catch (error) {
          lastError = error instanceof Error ? error : new Error('Unknown error');
          console.error(`Attempt ${attempt} failed:`, lastError.message);
          
          // 如果不是最后一次尝试，继续重试
          if (attempt < maxRetries) {
            console.log(`Retrying in 1 second...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          }
        }
      }

      // 所有重试都失败了
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error: Failed to generate a valid research plan after ${maxRetries} attempts. Last error: ${
              lastError?.message || "AI returned empty response"
            }. Please check your query and try again.`,
          },
        ],
      };
    }
  );

  server.tool(
    "generate-SERP-query",
    generateSERPQueryDescription,
    {
      plan: z.string().describe("Research plan for deep research."),
      language: z.string().optional().describe("The response Language."),
    },
    async ({ plan, language }, { signal }) => {
      signal.addEventListener("abort", () => {
        throw new Error("The client closed unexpectedly!");
      });

      // 严格检查研究计划是否为空
      if (!plan || plan.trim() === '') {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Error: Research plan is required to generate SERP queries. Please generate a research plan first using 'write-research-plan' tool.",
            },
          ],
        };
      }

      try {
        const deepResearch = initDeepResearchServer({ language });
        const result = await deepResearch.generateSERPQuery(plan);
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "search-task",
    searchTaskDescription,
    {
      tasks: z
        .array(
          z.object({
            query: z.string().describe("Information to be queried."),
            researchGoal: z.string().describe("The goal of this query task."),
          })
        )
        .describe("Information Collection Task List."),
      language: z.string().optional().describe("The response Language."),
      maxResult: z
        .number()
        .optional()
        .default(5)
        .describe("Maximum number of search results."),
      enableReferences: z
        .boolean()
        .default(true)
        .optional()
        .describe(
          "Whether to include citation links in search results and final reports."
        ),
    },
    async (
      { tasks, language, maxResult, enableReferences = true },
      { signal }
    ) => {
      signal.addEventListener("abort", () => {
        throw new Error("The client closed unexpectedly!");
      });

      try {
        const deepResearch = initDeepResearchServer({ language, maxResult });
        const result = await deepResearch.runSearchTask(
          tasks,
          enableReferences
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "write-final-report",
    writeFinalReportDescription,
    {
      plan: z.string().describe("Research plan for deep research."),
      tasks: z
        .array(
          z.object({
            query: z.string().describe("Information to be queried."),
            researchGoal: z.string().describe("The goal of this query task."),
            learning: z
              .string()
              .describe(
                "Knowledge learned while performing information gathering tasks."
              ),
            sources: z
              .array(
                z.object({
                  url: z.string().describe("Web link."),
                  title: z.string().optional().describe("Page title."),
                })
              )
              .optional()
              .describe(
                "Web page information that was queried when performing information collection tasks."
              ),
            images: z
              .array(
                z.object({
                  url: z.string().describe("Image link."),
                  description: z
                    .string()
                    .optional()
                    .describe("Image Description."),
                })
              )
              .optional()
              .describe(
                "Image resources obtained when performing information collection tasks."
              ),
          })
        )
        .describe(
          "The data information collected during the execution of the query task."
        ),
      language: z
        .string()
        .optional()
        .describe("The final report text language."),
      maxResult: z
        .number()
        .optional()
        .default(5)
        .describe("Maximum number of search results."),
      enableCitationImage: z
        .boolean()
        .default(true)
        .optional()
        .describe(
          "Whether to include content-related images in the final report."
        ),
      enableReferences: z
        .boolean()
        .default(true)
        .optional()
        .describe(
          "Whether to include citation links in search results and final reports."
        ),
    },
    async (
      {
        plan,
        tasks,
        language,
        maxResult,
        enableCitationImage = true,
        enableReferences = true,
      },
      { signal }
    ) => {
      signal.addEventListener("abort", () => {
        throw new Error("The client closed unexpectedly!");
      });

      // 严格检查必需参数
      if (!plan || plan.trim() === '') {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Error: Research plan is required to write final report. Please generate a research plan first using 'write-research-plan' tool.",
            },
          ],
        };
      }

      if (!tasks || tasks.length === 0) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Error: Search task results are required to write final report. Please execute search tasks first using 'search-task' tool.",
            },
          ],
        };
      }

      try {
        const deepResearch = initDeepResearchServer({ language, maxResult });
        const result = await deepResearch.writeFinalReport(
          plan,
          tasks,
          enableCitationImage,
          enableReferences
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
            },
          ],
        };
      }
    }
  );

  return server;
}
