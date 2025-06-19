import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AuthStore {
  jwt: string;
  topicId: string;
  dataBaseUrl: string; // 数据中心URL
  isAuthenticated: boolean;
}

interface AuthFunction {
  setJwt: (jwt: string) => void;
  setTopicId: (topicId: string) => void;
  setDataBaseUrl: (url: string) => void;
  setAuthenticated: (status: boolean) => void;
  clearAuth: () => void;
  update: (values: Partial<AuthStore>) => void;
}

export const defaultAuthValues: AuthStore = {
  jwt: "",
  topicId: "",
  dataBaseUrl: "",
  isAuthenticated: false,
};

export const useAuthStore = create(
  persist<AuthStore & AuthFunction>(
    (set) => ({
      ...defaultAuthValues,
      setJwt: (jwt) => set({ jwt, isAuthenticated: !!jwt }),
      setTopicId: (topicId) => set({ topicId }),
      setDataBaseUrl: (url) => set({ dataBaseUrl: url }),
      setAuthenticated: (status) => set({ isAuthenticated: status }),
      clearAuth: () => set(defaultAuthValues),
      update: (values) => set(values),
    }),
    { name: "auth" }
  )
);
