import { useState, useCallback } from "react";
import { useAuthStore } from "@/store/auth";
import { dataCenterAPI } from "@/services/dataCenterAPI";

export interface JwtValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * JWT认证管理Hook
 * 后台验证JWT，只在失败时提供错误信息
 */
export const useJwtAuth = () => {
  const authStore = useAuthStore();
  const [validationResult, setValidationResult] = useState<JwtValidationResult | null>(null);

  /**
   * 静默验证JWT令牌
   */
  const validateJwt = useCallback(async (): Promise<JwtValidationResult> => {
    if (!authStore.jwt) {
      return { valid: false, error: "No JWT token provided" };
    }

    try {
      const response = await dataCenterAPI.validateToken();
      
      if (response.success && response.data?.valid) {
        const result = { valid: true };
        setValidationResult(result);
        authStore.setAuthenticated(true);
        return result;
      } else {
        const result = { valid: false, error: response.error || "Authentication failed" };
        setValidationResult(result);
        authStore.setAuthenticated(false);
        return result;
      }
    } catch {
      const result = { valid: false, error: "Authentication error" };
      setValidationResult(result);
      authStore.setAuthenticated(false);
      return result;
    }
  }, [authStore]);

  /**
   * 清除认证信息
   */
  const clearAuth = useCallback(() => {
    authStore.clearAuth();
    setValidationResult(null);
  }, [authStore]);

  return {
    validationResult,
    validateJwt,
    clearAuth,
  };
};
