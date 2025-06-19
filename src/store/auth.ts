import { create } from "zustand";
import { persist } from "zustand/middleware";
import { extractUsernameFromJWT } from "@/utils/jwt";

export interface AuthStore {
  jwt: string;
  topicId: string;
  dataBaseUrl: string; // 数据中心URL
  username: string; // 当前用户名
  isAuthenticated: boolean;
}

interface AuthFunction {
  setJwt: (jwt: string) => void;
  setTopicId: (topicId: string) => void;
  setDataBaseUrl: (url: string) => void;
  setAuthenticated: (status: boolean) => void;
  clearAuth: () => void;
  clearUserData: () => void; // 清理用户相关数据但保留认证信息
  update: (values: Partial<AuthStore>) => void;
  // 安全设置JWT，会检查用户变更
  setJwtWithUserCheck: (jwt: string) => boolean; // 返回是否需要清理数据
}

export const defaultAuthValues: AuthStore = {
  jwt: "",
  topicId: "",
  dataBaseUrl: "",
  username: "",
  isAuthenticated: false,
};

export const useAuthStore = create(
  persist<AuthStore & AuthFunction>(
    (set, get) => ({
      ...defaultAuthValues,
      setJwt: (jwt) => {
        const username = jwt ? extractUsernameFromJWT(jwt) || "" : "";
        set({ jwt, username, isAuthenticated: !!jwt });
      },
      setTopicId: (topicId) => set({ topicId }),
      setDataBaseUrl: (url) => set({ dataBaseUrl: url }),
      setAuthenticated: (status) => set({ isAuthenticated: status }),
      clearAuth: () => set(defaultAuthValues),
      clearUserData: () => set({ topicId: "" }), // 只清理用户数据，保留认证信息
      update: (values) => set(values),
      setJwtWithUserCheck: (jwt) => {
        const currentState = get();
        const newUsername = jwt ? extractUsernameFromJWT(jwt) || "" : "";
        
        // 检查用户是否变更
        const userChanged = currentState.username && 
                           currentState.username !== newUsername && 
                           newUsername !== "";
        
        if (userChanged) {
          console.log('[AuthStore] 用户变更检测到，清理本地数据');
          // 清理用户相关数据
          set({ 
            jwt, 
            username: newUsername, 
            isAuthenticated: !!jwt,
            topicId: "" // 清理话题ID
          });
          return true; // 需要清理数据
        } else {
          // 正常设置JWT
          set({ 
            jwt, 
            username: newUsername, 
            isAuthenticated: !!jwt 
          });
          return false; // 不需要清理数据
        }
      },
    }),
    { name: "auth" }
  )
);
