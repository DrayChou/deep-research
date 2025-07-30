import { logger } from "@/utils/logger";

export interface AIProviderOptions {
  provider: string;
  baseURL?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  model: string;
  settings?: any;
}

export async function createAIProvider({
  provider,
  apiKey,
  baseURL,
  headers,
  model,
  settings,
}: AIProviderOptions) {
  const providerLogger = logger.getInstance('AI-Provider');
  const requestId = `provider-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  providerLogger.debug('Creating AI provider', {
    requestId,
    provider,
    model,
    baseURL: baseURL ? `${baseURL.substring(0, 50)}...` : 'Not configured',
    hasApiKey: !!apiKey,
    settings: settings ? 'Present' : 'Not present'
  });
  
  // 确保provider不为空或未定义
  if (!provider || provider.trim() === '') {
    providerLogger.warn('Empty provider provided, falling back to openaicompatible', { requestId });
    provider = 'openaicompatible';
  }
  
  provider = provider.trim();
  try {
    if (provider === "google") {
      providerLogger.debug('Creating Google provider', { requestId, model, settings });
      const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
      const google = createGoogleGenerativeAI({
        baseURL,
        apiKey,
      });
      const result = google(model, settings);
      providerLogger.info('Google provider created successfully', { requestId, model });
      return result;
    } else if (provider === "openai") {
      providerLogger.debug('Creating OpenAI provider', { requestId, model, settings });
      const { createOpenAI } = await import("@ai-sdk/openai");
      const openai = createOpenAI({
        baseURL,
        apiKey,
      });
      const result = model.startsWith("gpt-4o")
        ? openai.responses(model)
        : openai(model, settings);
      providerLogger.info('OpenAI provider created successfully', { requestId, model });
      return result;
    } else if (provider === "anthropic") {
      providerLogger.debug('Creating Anthropic provider', { requestId, model, settings });
      const { createAnthropic } = await import("@ai-sdk/anthropic");
      const anthropic = createAnthropic({
        baseURL,
        apiKey,
        headers,
      });
      const result = anthropic(model, settings);
      providerLogger.info('Anthropic provider created successfully', { requestId, model });
      return result;
    } else if (provider === "deepseek") {
      providerLogger.debug('Creating DeepSeek provider', { requestId, model, settings });
      const { createDeepSeek } = await import("@ai-sdk/deepseek");
      const deepseek = createDeepSeek({
        baseURL,
        apiKey,
      });
      const result = deepseek(model, settings);
      providerLogger.info('DeepSeek provider created successfully', { requestId, model });
      return result;
    } else if (provider === "xai") {
      providerLogger.debug('Creating XAI provider', { requestId, model, settings });
      const { createXai } = await import("@ai-sdk/xai");
      const xai = createXai({
        baseURL,
        apiKey,
      });
      const result = xai(model, settings);
      providerLogger.info('XAI provider created successfully', { requestId, model });
      return result;
    } else if (provider === "mistral") {
      providerLogger.debug('Creating Mistral provider', { requestId, model, settings });
      const { createMistral } = await import("@ai-sdk/mistral");
      const mistral = createMistral({
        baseURL,
        apiKey,
      });
      const result = mistral(model, settings);
      providerLogger.info('Mistral provider created successfully', { requestId, model });
      return result;
    } else if (provider === "azure") {
      providerLogger.debug('Creating Azure provider', { requestId, model, settings });
      const { createAzure } = await import("@ai-sdk/azure");
      const azure = createAzure({
        baseURL,
        apiKey,
      });
      const result = azure(model, settings);
      providerLogger.info('Azure provider created successfully', { requestId, model });
      return result;
    } else if (provider === "openrouter") {
      providerLogger.debug('Creating OpenRouter provider', { requestId, model, settings });
      const { createOpenRouter } = await import("@openrouter/ai-sdk-provider");
      const openrouter = createOpenRouter({
        baseURL,
        apiKey,
      });
      const result = openrouter(model, settings);
      providerLogger.info('OpenRouter provider created successfully', { requestId, model });
      return result;
    } else if (provider === "openaicompatible") {
      providerLogger.debug('Creating OpenAICompatible provider', { requestId, model, settings });
      const { createOpenAI } = await import("@ai-sdk/openai");
      const openaicompatible = createOpenAI({
        baseURL,
        apiKey,
        compatibility: "compatible",
      });
      const result = openaicompatible(model, settings);
      providerLogger.info('OpenAICompatible provider created successfully', { requestId, model });
      return result;
    } else if (provider === "pollinations") {
      providerLogger.debug('Creating Pollinations provider', { requestId, model, settings });
      const { createOpenAI } = await import("@ai-sdk/openai");
      const local = global.location || {};
      const pollinations = createOpenAI({
        baseURL,
        apiKey: apiKey ?? "",
        compatibility: "compatible",
        fetch: async (input, init) => {
          const headers = (init?.headers || {}) as Record<string, string>;
          if (!baseURL?.startsWith(local.origin)) delete headers["Authorization"];
          return await fetch(input, {
            ...init,
            headers,
            credentials: "omit",
          });
        },
      });
      const result = pollinations(model, settings);
      providerLogger.info('Pollinations provider created successfully', { requestId, model });
      return result;
    } else if (provider === "ollama") {
      providerLogger.debug('Creating Ollama provider', { requestId, model, settings });
      const { createOllama } = await import("ollama-ai-provider");
      const local = global.location || {};
      const ollama = createOllama({
        baseURL,
        headers,
        fetch: async (input, init) => {
          const headers = (init?.headers || {}) as Record<string, string>;
          if (!baseURL?.startsWith(local.origin)) delete headers["Authorization"];
          return await fetch(input, {
            ...init,
            headers,
            credentials: "omit",
          });
        },
      });
      const result = ollama(model, settings);
      providerLogger.info('Ollama provider created successfully', { requestId, model });
      return result;
    } else {
      providerLogger.warn('Unsupported AI provider, falling back to OpenAI', { requestId, provider });
      const { createOpenAI } = await import("@ai-sdk/openai");
      const openai = createOpenAI({
        baseURL: baseURL,
        apiKey: apiKey,
      });
      const result = openai(model, settings);
      providerLogger.info('Fallback OpenAI provider created successfully', { requestId, model });
      return result;
    }
  } catch (error) {
    providerLogger.error('Failed to create AI provider', error instanceof Error ? error : undefined, {
      requestId,
      provider,
      model,
      baseURL: baseURL ? `${baseURL.substring(0, 50)}...` : 'Not configured'
    });
    throw error;
  }
}
