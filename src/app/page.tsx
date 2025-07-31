"use client";
import dynamic from "next/dynamic";
import { useLayoutEffect, useEffect } from "react";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";
import { useGlobalStore } from "@/store/global";
import { useSettingStore } from "@/store/setting";
import { useAuthStore } from "@/store/auth";
import { useTaskStore } from "@/store/task";
import { useHistoryStore } from "@/store/history";
import { useKnowledgeStore } from "@/store/knowledge";
import { useChatHistory } from "@/hooks/useChatHistory";
import { useJwtAuth } from "@/hooks/useJwtAuth";

const Header = dynamic(() => import("@/components/Internal/Header"));
const Setting = dynamic(() => import("@/components/Setting"));
const Topic = dynamic(() => import("@/components/Research/Topic"));
const Feedback = dynamic(() => import("@/components/Research/Feedback"));
const SearchResult = dynamic(
  () => import("@/components/Research/SearchResult")
);
const FinalReport = dynamic(() => import("@/components/Research/FinalReport"));
const History = dynamic(() => import("@/components/History"));
const Knowledge = dynamic(() => import("@/components/Knowledge"));
const JwtStatus = dynamic(() => import("@/components/JwtStatus"));

function Home() {
  const { t } = useTranslation();
  const {
    openSetting,
    setOpenSetting,
    openHistory,
    setOpenHistory,
    openKnowledge,
    setOpenKnowledge,
  } = useGlobalStore();

  const { theme } = useSettingStore();
  const { setTheme } = useTheme();
  const chatHistory = useChatHistory();
  const jwtAuth = useJwtAuth();

  // 处理主题设置
  useLayoutEffect(() => {
    const settingStore = useSettingStore.getState();
    setTheme(settingStore.theme);
  }, [theme, setTheme]);

  // 处理 URL 参数初始化
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    
    // 先检查环境变量，然后在检查 url 参数
    if (process.env.NEXT_PUBLIC_DATA_CENTER_URL) {
      useAuthStore.getState().setDataBaseUrl(process.env.NEXT_PUBLIC_DATA_CENTER_URL);
    }
    if (searchParams.get('dataBaseUrl')) {
      useAuthStore.getState().setDataBaseUrl(searchParams.get('dataBaseUrl') || '');
    }
    
    // 在处理 URL 参数之前，先检查现有 JWT 的用户信息
    const currentAuth = useAuthStore.getState();
    if (currentAuth.jwt && currentAuth.username) {
      // 重新验证现有 JWT 的用户信息，检查是否有用户变更
      const needsClearData = useAuthStore.getState().setJwtWithUserCheck(currentAuth.jwt);
      if (needsClearData) {
        console.log('[Page] 应用启动时检测到用户变更，清理本地数据');
        useTaskStore.getState().reset();
        useHistoryStore.getState().clear();
        useKnowledgeStore.getState().clear();
      }
    }
    
    // 解析 URL 参数 - 基础配置
    const urlParams: any = {};
    if (searchParams.get('provider')) urlParams.provider = searchParams.get('provider');
    if (searchParams.get('apiKey')) urlParams.apiKey = searchParams.get('apiKey');
    if (searchParams.get('apiProxy')) urlParams.apiProxy = searchParams.get('apiProxy');
    if (searchParams.get('thinkingModel')) urlParams.thinkingModel = searchParams.get('thinkingModel');
    if (searchParams.get('taskModel')) urlParams.taskModel = searchParams.get('taskModel');
    if (searchParams.get('mode')) {
      const modeParam = searchParams.get('mode');
      // 映射 "research" 模式到 "local" 模式，因为 deep-research 只支持 "local" 和 "proxy"
      urlParams.mode = modeParam === 'research' ? 'local' : modeParam;
    }
    
    // 认证配置
    if (searchParams.get('jwt')) urlParams.jwt = searchParams.get('jwt');
    if (searchParams.get('topicId')) urlParams.topicId = searchParams.get('topicId');
    if (searchParams.get('topic_id')) urlParams.topicId = searchParams.get('topic_id');
    if (searchParams.get('dataBaseUrl')) urlParams.dataBaseUrl = searchParams.get('dataBaseUrl');
    if (searchParams.get('accessPassword')) urlParams.accessPassword = searchParams.get('accessPassword');
    
    // 各厂商专用 API 密钥
    if (searchParams.get('openAIApiKey')) urlParams.openAIApiKey = searchParams.get('openAIApiKey');
    if (searchParams.get('openAIApiProxy')) urlParams.openAIApiProxy = searchParams.get('openAIApiProxy');
    if (searchParams.get('openAIThinkingModel')) urlParams.openAIThinkingModel = searchParams.get('openAIThinkingModel');
    if (searchParams.get('openAINetworkingModel')) urlParams.openAINetworkingModel = searchParams.get('openAINetworkingModel');
    
    if (searchParams.get('anthropicApiKey')) urlParams.anthropicApiKey = searchParams.get('anthropicApiKey');
    if (searchParams.get('anthropicApiProxy')) urlParams.anthropicApiProxy = searchParams.get('anthropicApiProxy');
    if (searchParams.get('anthropicThinkingModel')) urlParams.anthropicThinkingModel = searchParams.get('anthropicThinkingModel');
    if (searchParams.get('anthropicNetworkingModel')) urlParams.anthropicNetworkingModel = searchParams.get('anthropicNetworkingModel');
    
    if (searchParams.get('deepseekApiKey')) urlParams.deepseekApiKey = searchParams.get('deepseekApiKey');
    if (searchParams.get('deepseekApiProxy')) urlParams.deepseekApiProxy = searchParams.get('deepseekApiProxy');
    if (searchParams.get('deepseekThinkingModel')) urlParams.deepseekThinkingModel = searchParams.get('deepseekThinkingModel');
    if (searchParams.get('deepseekNetworkingModel')) urlParams.deepseekNetworkingModel = searchParams.get('deepseekNetworkingModel');
    
    if (searchParams.get('openRouterApiKey')) urlParams.openRouterApiKey = searchParams.get('openRouterApiKey');
    if (searchParams.get('openRouterApiProxy')) urlParams.openRouterApiProxy = searchParams.get('openRouterApiProxy');
    if (searchParams.get('openRouterThinkingModel')) urlParams.openRouterThinkingModel = searchParams.get('openRouterThinkingModel');
    if (searchParams.get('openRouterNetworkingModel')) urlParams.openRouterNetworkingModel = searchParams.get('openRouterNetworkingModel');
    
    if (searchParams.get('xAIApiKey')) urlParams.xAIApiKey = searchParams.get('xAIApiKey');
    if (searchParams.get('xAIApiProxy')) urlParams.xAIApiProxy = searchParams.get('xAIApiProxy');
    if (searchParams.get('xAIThinkingModel')) urlParams.xAIThinkingModel = searchParams.get('xAIThinkingModel');
    if (searchParams.get('xAINetworkingModel')) urlParams.xAINetworkingModel = searchParams.get('xAINetworkingModel');
    
    if (searchParams.get('mistralApiKey')) urlParams.mistralApiKey = searchParams.get('mistralApiKey');
    if (searchParams.get('mistralApiProxy')) urlParams.mistralApiProxy = searchParams.get('mistralApiProxy');
    if (searchParams.get('mistralThinkingModel')) urlParams.mistralThinkingModel = searchParams.get('mistralThinkingModel');
    if (searchParams.get('mistralNetworkingModel')) urlParams.mistralNetworkingModel = searchParams.get('mistralNetworkingModel');
    
    if (searchParams.get('azureApiKey')) urlParams.azureApiKey = searchParams.get('azureApiKey');
    if (searchParams.get('azureResourceName')) urlParams.azureResourceName = searchParams.get('azureResourceName');
    if (searchParams.get('azureApiVersion')) urlParams.azureApiVersion = searchParams.get('azureApiVersion');
    if (searchParams.get('azureThinkingModel')) urlParams.azureThinkingModel = searchParams.get('azureThinkingModel');
    if (searchParams.get('azureNetworkingModel')) urlParams.azureNetworkingModel = searchParams.get('azureNetworkingModel');
    
    if (searchParams.get('openAICompatibleApiKey')) urlParams.openAICompatibleApiKey = searchParams.get('openAICompatibleApiKey');
    if (searchParams.get('openAICompatibleApiProxy')) urlParams.openAICompatibleApiProxy = searchParams.get('openAICompatibleApiProxy');
    if (searchParams.get('openAICompatibleThinkingModel')) urlParams.openAICompatibleThinkingModel = searchParams.get('openAICompatibleThinkingModel');
    if (searchParams.get('openAICompatibleNetworkingModel')) urlParams.openAICompatibleNetworkingModel = searchParams.get('openAICompatibleNetworkingModel');
    
    if (searchParams.get('pollinationsApiProxy')) urlParams.pollinationsApiProxy = searchParams.get('pollinationsApiProxy');
    if (searchParams.get('pollinationsThinkingModel')) urlParams.pollinationsThinkingModel = searchParams.get('pollinationsThinkingModel');
    if (searchParams.get('pollinationsNetworkingModel')) urlParams.pollinationsNetworkingModel = searchParams.get('pollinationsNetworkingModel');
    
    if (searchParams.get('ollamaApiProxy')) urlParams.ollamaApiProxy = searchParams.get('ollamaApiProxy');
    if (searchParams.get('ollamaThinkingModel')) urlParams.ollamaThinkingModel = searchParams.get('ollamaThinkingModel');
    if (searchParams.get('ollamaNetworkingModel')) urlParams.ollamaNetworkingModel = searchParams.get('ollamaNetworkingModel');
    
    // 搜索配置
    if (searchParams.get('enableSearch')) urlParams.enableSearch = searchParams.get('enableSearch');
    if (searchParams.get('searchProvider')) urlParams.searchProvider = searchParams.get('searchProvider');
    if (searchParams.get('tavilyApiKey')) urlParams.tavilyApiKey = searchParams.get('tavilyApiKey');
    if (searchParams.get('tavilyApiProxy')) urlParams.tavilyApiProxy = searchParams.get('tavilyApiProxy');
    if (searchParams.get('tavilyScope')) urlParams.tavilyScope = searchParams.get('tavilyScope');
    if (searchParams.get('firecrawlApiKey')) urlParams.firecrawlApiKey = searchParams.get('firecrawlApiKey');
    if (searchParams.get('firecrawlApiProxy')) urlParams.firecrawlApiProxy = searchParams.get('firecrawlApiProxy');
    if (searchParams.get('exaApiKey')) urlParams.exaApiKey = searchParams.get('exaApiKey');
    if (searchParams.get('exaApiProxy')) urlParams.exaApiProxy = searchParams.get('exaApiProxy');
    if (searchParams.get('exaScope')) urlParams.exaScope = searchParams.get('exaScope');
    if (searchParams.get('bochaApiKey')) urlParams.bochaApiKey = searchParams.get('bochaApiKey');
    if (searchParams.get('bochaApiProxy')) urlParams.bochaApiProxy = searchParams.get('bochaApiProxy');
    if (searchParams.get('searxngApiProxy')) urlParams.searxngApiProxy = searchParams.get('searxngApiProxy');
    if (searchParams.get('searxngScope')) urlParams.searxngScope = searchParams.get('searxngScope');
    if (searchParams.get('parallelSearch')) urlParams.parallelSearch = parseInt(searchParams.get('parallelSearch') || '1');
    if (searchParams.get('searchMaxResult')) urlParams.searchMaxResult = parseInt(searchParams.get('searchMaxResult') || '5');
    if (searchParams.get('crawler')) urlParams.crawler = searchParams.get('crawler');
    
    // 界面配置
    if (searchParams.get('language')) urlParams.language = searchParams.get('language');
    if (searchParams.get('theme')) urlParams.theme = searchParams.get('theme');
    if (searchParams.get('debug')) urlParams.debug = searchParams.get('debug');
    if (searchParams.get('references')) urlParams.references = searchParams.get('references');
    if (searchParams.get('citationImage')) urlParams.citationImage = searchParams.get('citationImage');
    
    if (Object.keys(urlParams).length > 0) {
      console.log('[Home] Detected URL params:', urlParams);      // 应用配置参数到设置
      const settingUpdates: any = {};
      
      // 处理provider和通用apiKey映射
      if (urlParams.provider) {
        settingUpdates.provider = urlParams.provider;
        switch (urlParams.provider) {
          case 'google':
            if (urlParams.apiKey) settingUpdates.apiKey = urlParams.apiKey;
            if (urlParams.thinkingModel) settingUpdates.thinkingModel = urlParams.thinkingModel;
            if (urlParams.taskModel) settingUpdates.networkingModel = urlParams.taskModel;
            if (urlParams.apiProxy) settingUpdates.apiProxy = urlParams.apiProxy;
            break;
          case 'openai':
            if (urlParams.apiKey) settingUpdates.openAIApiKey = urlParams.apiKey;
            if (urlParams.thinkingModel) settingUpdates.openAIThinkingModel = urlParams.thinkingModel;
            if (urlParams.taskModel) settingUpdates.openAINetworkingModel = urlParams.taskModel;
            if (urlParams.apiProxy) settingUpdates.openAIApiProxy = urlParams.apiProxy;
            break;
          case 'anthropic':
            if (urlParams.apiKey) settingUpdates.anthropicApiKey = urlParams.apiKey;
            if (urlParams.thinkingModel) settingUpdates.anthropicThinkingModel = urlParams.thinkingModel;
            if (urlParams.taskModel) settingUpdates.anthropicNetworkingModel = urlParams.taskModel;
            if (urlParams.apiProxy) settingUpdates.anthropicApiProxy = urlParams.apiProxy;
            break;
          case 'deepseek':
            if (urlParams.apiKey) settingUpdates.deepseekApiKey = urlParams.apiKey;
            if (urlParams.thinkingModel) settingUpdates.deepseekThinkingModel = urlParams.thinkingModel;
            if (urlParams.taskModel) settingUpdates.deepseekNetworkingModel = urlParams.taskModel;
            if (urlParams.apiProxy) settingUpdates.deepseekApiProxy = urlParams.apiProxy;
            break;
          case 'openrouter':
            if (urlParams.apiKey) settingUpdates.openRouterApiKey = urlParams.apiKey;
            if (urlParams.thinkingModel) settingUpdates.openRouterThinkingModel = urlParams.thinkingModel;
            if (urlParams.taskModel) settingUpdates.openRouterNetworkingModel = urlParams.taskModel;
            if (urlParams.apiProxy) settingUpdates.openRouterApiProxy = urlParams.apiProxy;
            break;
          case 'xai':
            if (urlParams.apiKey) settingUpdates.xAIApiKey = urlParams.apiKey;
            if (urlParams.thinkingModel) settingUpdates.xAIThinkingModel = urlParams.thinkingModel;
            if (urlParams.taskModel) settingUpdates.xAINetworkingModel = urlParams.taskModel;
            if (urlParams.apiProxy) settingUpdates.xAIApiProxy = urlParams.apiProxy;
            break;
          case 'mistral':
            if (urlParams.apiKey) settingUpdates.mistralApiKey = urlParams.apiKey;
            if (urlParams.thinkingModel) settingUpdates.mistralThinkingModel = urlParams.thinkingModel;
            if (urlParams.taskModel) settingUpdates.mistralNetworkingModel = urlParams.taskModel;
            if (urlParams.apiProxy) settingUpdates.mistralApiProxy = urlParams.apiProxy;
            break;
          case 'azure':
            if (urlParams.apiKey) settingUpdates.azureApiKey = urlParams.apiKey;
            if (urlParams.thinkingModel) settingUpdates.azureThinkingModel = urlParams.thinkingModel;
            if (urlParams.taskModel) settingUpdates.azureNetworkingModel = urlParams.taskModel;
            if (urlParams.apiProxy) settingUpdates.azureApiProxy = urlParams.apiProxy;
            if (urlParams.resourceName) settingUpdates.azureResourceName = urlParams.resourceName;
            if (urlParams.apiVersion) settingUpdates.azureApiVersion = urlParams.apiVersion;
            break;
          case 'openaicompatible':
            if (urlParams.apiKey) settingUpdates.openAICompatibleApiKey = urlParams.apiKey;
            if (urlParams.thinkingModel) settingUpdates.openAICompatibleThinkingModel = urlParams.thinkingModel;
            if (urlParams.taskModel) settingUpdates.openAICompatibleNetworkingModel = urlParams.taskModel;
            if (urlParams.apiProxy) settingUpdates.openAICompatibleApiProxy = urlParams.apiProxy;
            break;
          case 'pollinations':
            if (urlParams.thinkingModel) settingUpdates.pollinationsThinkingModel = urlParams.thinkingModel;
            if (urlParams.taskModel) settingUpdates.pollinationsNetworkingModel = urlParams.taskModel;
            if (urlParams.apiProxy) settingUpdates.pollinationsApiProxy = urlParams.apiProxy;
            break;
          case 'ollama':
            if (urlParams.thinkingModel) settingUpdates.ollamaThinkingModel = urlParams.thinkingModel;
            if (urlParams.taskModel) settingUpdates.ollamaNetworkingModel = urlParams.taskModel;
            if (urlParams.apiProxy) settingUpdates.ollamaApiProxy = urlParams.apiProxy;
            break;
        }
      }
      
      // 直接映射所有厂商专用配置
      const directMappings = [
        'mode', 'apiProxy',
        'openAIApiKey', 'openAIApiProxy', 'openAIThinkingModel', 'openAINetworkingModel',
        'anthropicApiKey', 'anthropicApiProxy', 'anthropicThinkingModel', 'anthropicNetworkingModel',
        'deepseekApiKey', 'deepseekApiProxy', 'deepseekThinkingModel', 'deepseekNetworkingModel',
        'openRouterApiKey', 'openRouterApiProxy', 'openRouterThinkingModel', 'openRouterNetworkingModel',
        'xAIApiKey', 'xAIApiProxy', 'xAIThinkingModel', 'xAINetworkingModel',
        'mistralApiKey', 'mistralApiProxy', 'mistralThinkingModel', 'mistralNetworkingModel',
        'azureApiKey', 'azureResourceName', 'azureApiVersion', 'azureThinkingModel', 'azureNetworkingModel',
        'openAICompatibleApiKey', 'openAICompatibleApiProxy', 'openAICompatibleThinkingModel', 'openAICompatibleNetworkingModel',
        'pollinationsApiProxy', 'pollinationsThinkingModel', 'pollinationsNetworkingModel',
        'ollamaApiProxy', 'ollamaThinkingModel', 'ollamaNetworkingModel',
        'enableSearch', 'searchProvider',
        'tavilyApiKey', 'tavilyApiProxy', 'tavilyScope',
        'firecrawlApiKey', 'firecrawlApiProxy',
        'exaApiKey', 'exaApiProxy', 'exaScope',
        'bochaApiKey', 'bochaApiProxy',
        'searxngApiProxy', 'searxngScope',
        'parallelSearch', 'searchMaxResult', 'crawler',
        'language', 'theme', 'debug', 'references', 'citationImage'
      ];
      
      directMappings.forEach(key => {
        if (urlParams[key] !== undefined) {
          settingUpdates[key] = urlParams[key];
        }
      });
      
      // 处理accessPassword
      if (urlParams.accessPassword) {
        settingUpdates.accessPassword = urlParams.accessPassword;
      }
      
      if (Object.keys(settingUpdates).length > 0) {
        useSettingStore.getState().update(settingUpdates);
      }

      // 处理认证相关参数
      if (urlParams.jwt) {
        // 使用安全的JWT设置，检查用户变更
        const needsClearData = useAuthStore.getState().setJwtWithUserCheck(urlParams.jwt);
        
        if (needsClearData) {
          console.log('[Page] 检测到用户变更，清理本地数据');
          // 清理所有用户相关数据
          useTaskStore.getState().reset();
          useHistoryStore.getState().clear();
          useKnowledgeStore.getState().clear();
          // 不清理setting store，因为它包含系统配置而非用户数据
        }
        
        // 后台验证JWT
        setTimeout(() => {
          jwtAuth.validateJwt();
        }, 100);
      }

      if (urlParams.dataBaseUrl) {
        useAuthStore.getState().setDataBaseUrl(urlParams.dataBaseUrl);
        console.log('[Home] 数据中心URL已设置:', urlParams.dataBaseUrl);
      }

      if (urlParams.topicId) {
        useAuthStore.getState().setTopicId(urlParams.topicId);
        // 加载话题历史
        setTimeout(async () => {
          await chatHistory.initializeOrLoadTopic(urlParams.topicId);
        }, 200);
      } else if (Object.keys(urlParams).length > 0) {
        // 有其他URL参数但没有topicId，说明是新建话题配置，清空当前研究状态
        console.log('[Home] 新建话题模式，清空当前研究状态');
        useAuthStore.getState().setTopicId(''); // 清空话题ID
        useTaskStore.getState().reset(); // 清空研究任务状态
      }

      // 清理敏感 URL 参数
      setTimeout(() => {
        const newParams = new URLSearchParams(searchParams);
        const sensitiveParams = [
          'apiKey', 'jwt', 'accessPassword', 'dataBaseUrl',
          'openAIApiKey', 'anthropicApiKey', 'deepseekApiKey', 'openRouterApiKey',
          'xAIApiKey', 'mistralApiKey', 'azureApiKey', 'openAICompatibleApiKey',
          'tavilyApiKey', 'firecrawlApiKey', 'exaApiKey', 'bochaApiKey'
        ];
        
        let hasChanges = false;
        sensitiveParams.forEach(param => {
          if (newParams.has(param)) {
            newParams.delete(param);
            hasChanges = true;
          }
        });
        
        if (hasChanges) {
          const newUrl = `${window.location.pathname}?${newParams.toString()}`;
          window.history.replaceState({}, '', newUrl);
        }
      }, 1000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {/* JWT全屏错误界面 - 在最顶层渲染 */}
      <JwtStatus />
      
      {/* 历史记录加载状态 */}
      {chatHistory.isLoadingHistory && (
        <div className="fixed inset-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm z-40 flex items-center justify-center p-4">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-green-600 dark:border-green-400 border-t-transparent rounded-full animate-spin" />
            </div>
            
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {t("common.loading")}
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                {t("auth.loadingHistory")}
              </p>
            </div>
          </div>
        </div>
      )}
      
      <div className="max-lg:max-w-screen-md max-w-screen-lg mx-auto px-4">
        <Header />
        
        <main>
          <Topic />
          <Feedback />
          <SearchResult />
          <FinalReport />
        </main>
        <aside className="print:hidden">
          <Setting open={openSetting} onClose={() => setOpenSetting(false)} />
          <History open={openHistory} onClose={() => setOpenHistory(false)} />
          <Knowledge
            open={openKnowledge}
            onClose={() => setOpenKnowledge(false)}
          />
        </aside>
      </div>
    </>
  );
}

export default Home;
