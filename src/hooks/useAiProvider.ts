import { useSettingStore } from "@/store/setting";
import {
  createAIProvider,
  type AIProviderOptions,
} from "@/utils/deep-research/provider";
import {
  GEMINI_BASE_URL,
  OPENROUTER_BASE_URL,
  OPENAI_BASE_URL,
  ANTHROPIC_BASE_URL,
  DEEPSEEK_BASE_URL,
  XAI_BASE_URL,
  MISTRAL_BASE_URL,
  OLLAMA_BASE_URL,
  POLLINATIONS_BASE_URL,
} from "@/constants/urls";
import { multiApiKeyPolling } from "@/utils/model";
import { generateSignature } from "@/utils/signature";
import { completePath } from "@/utils/url";
import {
  getProviderModelFields,
  hasValidApiKey,
} from "@/utils/provider-config";

function useModelProvider() {
  async function createModelProvider(model: string, settings?: any) {
    const { mode, provider, accessPassword } = useSettingStore.getState();
    const options: AIProviderOptions = {
      provider,
      model,
      settings,
    };

    switch (provider) {
      case "google":
        const { apiKey = "", apiProxy } = useSettingStore.getState();
        if (mode === "local") {
          options.baseURL = completePath(
            apiProxy || GEMINI_BASE_URL,
            "/v1beta"
          );
          options.apiKey = multiApiKeyPolling(apiKey);
        } else {
          options.baseURL = location.origin + "/api/ai/google/v1beta";
        }
        break;
      case "openai":
        const { openAIApiKey = "", openAIApiProxy } =
          useSettingStore.getState();
        if (mode === "local") {
          options.baseURL = completePath(
            openAIApiProxy || OPENAI_BASE_URL,
            "/v1"
          );
          options.apiKey = multiApiKeyPolling(openAIApiKey);
        } else {
          options.baseURL = location.origin + "/api/ai/openai/v1";
        }
        break;
      case "anthropic":
        const { anthropicApiKey = "", anthropicApiProxy } =
          useSettingStore.getState();
        if (mode === "local") {
          options.baseURL = completePath(
            anthropicApiProxy || ANTHROPIC_BASE_URL,
            "/v1"
          );
          options.headers = {
            // Avoid cors error
            "anthropic-dangerous-direct-browser-access": "true",
          };
          options.apiKey = multiApiKeyPolling(anthropicApiKey);
        } else {
          options.baseURL = location.origin + "/api/ai/anthropic/v1";
        }
        break;
      case "deepseek":
        const { deepseekApiKey = "", deepseekApiProxy } =
          useSettingStore.getState();
        if (mode === "local") {
          options.baseURL = completePath(
            deepseekApiProxy || DEEPSEEK_BASE_URL,
            "/v1"
          );
          options.apiKey = multiApiKeyPolling(deepseekApiKey);
        } else {
          options.baseURL = location.origin + "/api/ai/deepseek/v1";
        }
        break;
      case "xai":
        const { xAIApiKey = "", xAIApiProxy } = useSettingStore.getState();
        if (mode === "local") {
          options.baseURL = completePath(xAIApiProxy || XAI_BASE_URL, "/v1");
          options.apiKey = multiApiKeyPolling(xAIApiKey);
        } else {
          options.baseURL = location.origin + "/api/ai/xai/v1";
        }
        break;
      case "mistral":
        const { mistralApiKey = "", mistralApiProxy } =
          useSettingStore.getState();
        if (mode === "local") {
          options.baseURL = completePath(
            mistralApiProxy || MISTRAL_BASE_URL,
            "/v1"
          );
          options.apiKey = multiApiKeyPolling(mistralApiKey);
        } else {
          options.baseURL = location.origin + "/api/ai/mistral/v1";
        }
        break;
      case "azure":
        const { azureApiKey = "", azureResourceName } =
          useSettingStore.getState();
        if (mode === "local") {
          options.baseURL = `https://${azureResourceName}.openai.azure.com/openai/deployments`;
          options.apiKey = multiApiKeyPolling(azureApiKey);
        } else {
          options.baseURL = location.origin + "/api/ai/azure";
        }
        break;
      case "openrouter":
        const { openRouterApiKey = "", openRouterApiProxy } =
          useSettingStore.getState();
        if (mode === "local") {
          options.baseURL = completePath(
            openRouterApiProxy || OPENROUTER_BASE_URL,
            "/api/v1"
          );
          options.apiKey = multiApiKeyPolling(openRouterApiKey);
        } else {
          options.baseURL = location.origin + "/api/ai/openrouter/api/v1";
        }
        break;
      case "openaicompatible":
        const { openAICompatibleApiKey = "", openAICompatibleApiProxy } =
          useSettingStore.getState();
        if (mode === "local") {
          options.baseURL = completePath(openAICompatibleApiProxy, "/v1");
          options.apiKey = multiApiKeyPolling(openAICompatibleApiKey);
        } else {
          options.baseURL = location.origin + "/api/ai/openaicompatible/v1";
        }
        break;
      case "pollinations":
        const { pollinationsApiProxy } = useSettingStore.getState();
        if (mode === "local") {
          options.baseURL = completePath(
            pollinationsApiProxy || POLLINATIONS_BASE_URL,
            "/v1"
          );
        } else {
          options.baseURL = location.origin + "/api/ai/pollinations/v1";
        }
        break;
      case "ollama":
        const { ollamaApiProxy } = useSettingStore.getState();
        if (mode === "local") {
          options.baseURL = completePath(
            ollamaApiProxy || OLLAMA_BASE_URL,
            "/api"
          );
        } else {
          options.baseURL = location.origin + "/api/ai/ollama/api";
          options.headers = {
            Authorization: generateSignature(accessPassword, Date.now()),
          };
        }
        break;
      default:
        break;
    }

    if (mode === "proxy") {
      options.apiKey = generateSignature(accessPassword, Date.now());
    }
    return await createAIProvider(options);
  }

  function getModel() {
    const { provider } = useSettingStore.getState();
    const config = useSettingStore.getState();
    return getProviderModelFields(provider, config);
  }

  function hasApiKey(): boolean {
    const { provider } = useSettingStore.getState();
    const config = useSettingStore.getState();
    return hasValidApiKey(provider, config);
  }

  return {
    createModelProvider,
    getModel,
    hasApiKey,
  };
}

export default useModelProvider;
