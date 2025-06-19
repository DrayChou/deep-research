"use client";
import dynamic from "next/dynamic";
import { useLayoutEffect, useEffect } from "react";
import { useTheme } from "next-themes";
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
    
    // 检查是否需要JWT认证（如果配置了数据中心URL）
    const envDataCenterUrl = process.env.NEXT_PUBLIC_DATA_CENTER_URL;
    if (envDataCenterUrl) {
      useAuthStore.getState().setDataBaseUrl(envDataCenterUrl);
    }
    
    // 在处理URL参数之前，先检查现有JWT的用户信息
    const currentAuth = useAuthStore.getState();
    if (currentAuth.jwt && currentAuth.username) {
      // 重新验证现有JWT的用户信息，检查是否有用户变更
      const needsClearData = useAuthStore.getState().setJwtWithUserCheck(currentAuth.jwt);
      if (needsClearData) {
        console.log('[Page] 应用启动时检测到用户变更，清理本地数据');
        useTaskStore.getState().reset();
        useHistoryStore.getState().clear();
        useKnowledgeStore.getState().clear();
      }
    }
    
    // 解析 URL 参数
    const urlParams: any = {};
    if (searchParams.get('provider')) urlParams.provider = searchParams.get('provider');
    if (searchParams.get('apiKey')) urlParams.apiKey = searchParams.get('apiKey');
    if (searchParams.get('thinkingModel')) urlParams.thinkingModel = searchParams.get('thinkingModel');
    if (searchParams.get('taskModel')) urlParams.taskModel = searchParams.get('taskModel');
    if (searchParams.get('jwt')) urlParams.jwt = searchParams.get('jwt');
    if (searchParams.get('topicId')) urlParams.topicId = searchParams.get('topicId');
    if (searchParams.get('dataBaseUrl')) urlParams.dataBaseUrl = searchParams.get('dataBaseUrl');
    if (searchParams.get('searchProvider')) urlParams.searchProvider = searchParams.get('searchProvider');
    if (searchParams.get('language')) urlParams.language = searchParams.get('language');
    if (searchParams.get('theme')) urlParams.theme = searchParams.get('theme');
    
    if (Object.keys(urlParams).length > 0) {
      console.log('[Home] Detected URL params:', urlParams);

      // 应用配置参数到设置
      const settingUpdates: any = {};
      
      if (urlParams.provider) {
        settingUpdates.provider = urlParams.provider;
        switch (urlParams.provider) {
          case 'google':
            if (urlParams.apiKey) settingUpdates.apiKey = urlParams.apiKey;
            if (urlParams.thinkingModel) settingUpdates.thinkingModel = urlParams.thinkingModel;
            if (urlParams.taskModel) settingUpdates.networkingModel = urlParams.taskModel;
            break;
          case 'openai':
            if (urlParams.apiKey) settingUpdates.openAIApiKey = urlParams.apiKey;
            if (urlParams.thinkingModel) settingUpdates.openAIThinkingModel = urlParams.thinkingModel;
            if (urlParams.taskModel) settingUpdates.openAINetworkingModel = urlParams.taskModel;
            break;
          case 'deepseek':
            if (urlParams.apiKey) settingUpdates.deepseekApiKey = urlParams.apiKey;
            if (urlParams.thinkingModel) settingUpdates.deepseekThinkingModel = urlParams.thinkingModel;
            if (urlParams.taskModel) settingUpdates.deepseekNetworkingModel = urlParams.taskModel;
            break;
        }
      }
      
      if (urlParams.searchProvider) settingUpdates.searchProvider = urlParams.searchProvider;
      if (urlParams.language) settingUpdates.language = urlParams.language;
      if (urlParams.theme) settingUpdates.theme = urlParams.theme;
      
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
      }

      // 清理敏感 URL 参数
      setTimeout(() => {
        const newParams = new URLSearchParams(searchParams);
        const sensitiveParams = ['apiKey', 'jwt', 'accessPassword', 'dataBaseUrl'];
        
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
