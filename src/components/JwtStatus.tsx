"use client";
import { useTranslation } from "react-i18next";
import { AlertCircle, Shield, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useJwtAuth } from "@/hooks/useJwtAuth";
import { useAuthStore } from "@/store/auth";

function JwtStatus() {
  const { t } = useTranslation();
  const { jwt } = useAuthStore();
  const { validationResult, isValidating, clearAuth } = useJwtAuth();

  // 显示权限验证加载状态
  if (jwt && isValidating && !validationResult) {
    return (
      <div className="fixed inset-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="mx-auto w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin" />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {t("auth.verifying")}
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              {t("auth.verifyingPermissions")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 如果没有JWT或JWT验证失败，显示全屏错误界面
  // 注意：dataBaseUrl现在会自动推断，不再需要显式配置
  if (!jwt || (validationResult && !validationResult.valid)) {
    return (
      <div className="fixed inset-0 bg-white dark:bg-gray-900 z-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center relative">
            {!jwt ? (
              <>
                <Shield className="w-8 h-8 text-red-600 dark:text-red-400 z-10" />
                <div className="absolute inset-0 w-16 h-16 border-4 border-red-300 dark:border-red-700 border-t-red-600 dark:border-t-red-400 rounded-full animate-spin opacity-70" />
              </>
            ) : (
              <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
            )}
          </div>
          
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {!jwt ? t("auth.authenticationRequired") : t("auth.authenticationError")}
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              {!jwt ? t("auth.jwtRequired") : t("auth.authenticationFailed")}
            </p>
          </div>

          {validationResult && !validationResult.valid && (
            <Button 
              onClick={clearAuth}
              variant="outline"
              className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/20"
            >
              {t("common.ok")}
            </Button>
          )}
        </div>
      </div>
    );
  }

  // JWT验证成功或还在验证中，不显示任何内容
  return null;
}

export default JwtStatus;
