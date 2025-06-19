"use client";
import dynamic from "next/dynamic";
import { useLayoutEffect, useEffect, useCallback } from "react";
import { useTheme } from "next-themes";
import { useGlobalStore } from "@/store/global";
import { useSettingStore } from "@/store/setting";
import { useAuthStore } from "@/store/auth";
import { useChatHistory } from "@/hooks/useChatHistory";

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
  const authStore = useAuthStore();
  const chatHistory = useChatHistory();

  // 处理主题设置
  useLayoutEffect(() => {
    const settingStore = useSettingStore.getState();
    setTheme(settingStore.theme);
  }, [theme, setTheme]);
  // 处理URL参数初始化 - 只在组件挂载时执行一次
  useEffect(() => {
    // 直接在effect内部调用，避免依赖函数引用
    const searchParams = new URLSearchParams(window.location.search);
    const urlParams: any = {};
    
    // 解析URL参数
    if (searchParams.get('provider')) urlParams.provider = searchParams.get('provider');
    if (searchParams.get('apiKey')) urlParams.apiKey = searchParams.get('apiKey');
    if (searchParams.get('thinkingModel')) urlParams.thinkingModel = searchParams.get('thinkingModel');
    if (searchParams.get('taskModel')) urlParams.taskModel = searchParams.get('taskModel');
    if (searchParams.get('jwt')) urlParams.jwt = searchParams.get('jwt');
    if (searchParams.get('topicId')) urlParams.topicId = searchParams.get('topicId');
    if (searchParams.get('searchProvider')) urlParams.searchProvider = searchParams.get('searchProvider');
    if (searchParams.get('language')) urlParams.language = searchParams.get('language');
    if (searchParams.get('theme')) urlParams.theme = searchParams.get('theme');
    
    console.log('[Home] 检测到URL参数:', urlParams);

    // 应用配置参数到设置store
    if (Object.keys(urlParams).length > 0) {
      const settingUpdates: any = {};
      
      if (urlParams.provider) {
        settingUpdates.provider = urlParams.provider;
        // 根据provider设置对应的API Key
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
      
      // 应用设置更新
      if (Object.keys(settingUpdates).length > 0) {
        useSettingStore.getState().update(settingUpdates);
      }
    }

    // 处理认证相关参数
    if (urlParams.jwt) {
      useAuthStore.getState().setJwt(urlParams.jwt);
      console.log('[Home] 设置JWT令牌');
    }    if (urlParams.topicId) {
      useAuthStore.getState().setTopicId(urlParams.topicId);
      console.log('[Home] 设置话题 ID：', urlParams.topicId);
      
      // 使用顶层声明的chatHistory
      chatHistory.initializeOrLoadTopic(urlParams.topicId);
    }

    // 清理敏感URL参数
    setTimeout(() => {
      const newParams = new URLSearchParams(searchParams);
      const sensitiveParams = ['apiKey', 'jwt'];
      
      let hasChanges = false;
      sensitiveParams.forEach(param => {
        if (newParams.has(param)) {
          newParams.delete(param);
          hasChanges = true;
        }
      });
        if (hasChanges) {
        const newUrl = `${window.location.pathname}${newParams.toString() ? '?' + newParams.toString() : ''}`;
        window.history.replaceState({}, '', newUrl);
        console.log('[Home] 已清理敏感URL参数');
      }    }, 1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 忽略chatHistory依赖，避免循环
  return (
    <div className="max-lg:max-w-screen-md max-w-screen-lg mx-auto px-4">
      <Header />
      <main>
        <Topic />
        <Feedback />
        <SearchResult />
        <FinalReport />
      </main>
      {/*
      <footer className="my-4 text-center text-sm text-gray-600 print:hidden">
        <a href="https://github.com/u14app/" target="_blank">
          {t("copyright", {
            name: "U14App",
          })}
        </a>
      </footer>
      */}
      <aside className="print:hidden">
        <Setting open={openSetting} onClose={() => setOpenSetting(false)} />
        <History open={openHistory} onClose={() => setOpenHistory(false)} />
        <Knowledge
          open={openKnowledge}
          onClose={() => setOpenKnowledge(false)}
        />
      </aside>
    </div>
  );
}

export default Home;
