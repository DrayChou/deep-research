"use client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUrlConfig, type UrlConfigParams } from "@/hooks/useUrlConfig";
import { toast } from "sonner";

export function ConfigUrlGenerator() {
  const { t } = useTranslation();
  const { generateConfigUrl } = useUrlConfig();
  
  const [config, setConfig] = useState<UrlConfigParams>({
    provider: "google",
    thinkingModel: "gemini-2.0-flash-thinking-exp",
    taskModel: "gemini-2.0-flash-exp",
    searchProvider: "model",
    language: "zh-CN",
    theme: "system",
  });
  
  const [generatedUrl, setGeneratedUrl] = useState("");

  const handleConfigChange = (key: keyof UrlConfigParams, value: string) => {
    setConfig(prev => ({
      ...prev,
      [key]: value || undefined,
    }));
  };

  const handleGenerate = () => {
    const url = generateConfigUrl(config);
    setGeneratedUrl(url);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedUrl);
      toast.success(t("configUrlGenerator.copied"));
    } catch {
      toast.error(t("configUrlGenerator.copyFailed"));
    }
  };

  const handleOpen = () => {
    window.open(generatedUrl, '_blank');
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>{t("configUrlGenerator.title")}</CardTitle>
        <CardDescription>
          {t("configUrlGenerator.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="basic">{t("configUrlGenerator.basic")}</TabsTrigger>
            <TabsTrigger value="auth">{t("configUrlGenerator.auth")}</TabsTrigger>
            <TabsTrigger value="advanced">{t("configUrlGenerator.advanced")}</TabsTrigger>
          </TabsList>
          
          <TabsContent value="basic" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="provider">{t("configUrlGenerator.provider")}</Label>
                <select
                  id="provider"
                  className="w-full p-2 border rounded"
                  value={config.provider || ""}
                  onChange={(e) => handleConfigChange("provider", e.target.value)}
                >
                  <option value="google">Google (Gemini)</option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="deepseek">DeepSeek</option>
                  <option value="openrouter">OpenRouter</option>
                </select>
              </div>
              
              <div>
                <Label htmlFor="apiKey">{t("configUrlGenerator.apiKey")}</Label>
                <Input
                  id="apiKey"
                  type="password"
                  placeholder={t("configUrlGenerator.apiKey")}
                  value={config.apiKey || ""}
                  onChange={(e) => handleConfigChange("apiKey", e.target.value)}
                />
              </div>
              
              <div>
                <Label htmlFor="thinkingModel">{t("configUrlGenerator.thinkingModel")}</Label>
                <Input
                  id="thinkingModel"
                  placeholder="例如: gemini-2.0-flash-thinking-exp"
                  value={config.thinkingModel || ""}
                  onChange={(e) => handleConfigChange("thinkingModel", e.target.value)}
                />
              </div>
              
              <div>
                <Label htmlFor="taskModel">{t("configUrlGenerator.taskModel")}</Label>
                <Input
                  id="taskModel"
                  placeholder="例如: gemini-2.0-flash-exp"
                  value={config.taskModel || ""}
                  onChange={(e) => handleConfigChange("taskModel", e.target.value)}
                />
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="auth" className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
              <div>
                <Label htmlFor="jwt">{t("configUrlGenerator.jwt")}</Label>
                <Textarea
                  id="jwt"
                  placeholder={t("configUrlGenerator.jwt")}
                  value={config.jwt || ""}
                  onChange={(e) => handleConfigChange("jwt", e.target.value)}
                  rows={3}
                />
              </div>
              
              <div>
                <Label htmlFor="topicId">{t("configUrlGenerator.topicId")}</Label>
                <Input
                  id="topicId"
                  placeholder={t("configUrlGenerator.topicId")}
                  value={config.topicId || ""}
                  onChange={(e) => handleConfigChange("topicId", e.target.value)}
                />
              </div>
              
              <div>
                <Label htmlFor="accessPassword">{t("configUrlGenerator.accessPassword")}</Label>
                <Input
                  id="accessPassword"
                  type="password"
                  placeholder={t("configUrlGenerator.accessPassword")}
                  value={config.accessPassword || ""}
                  onChange={(e) => handleConfigChange("accessPassword", e.target.value)}
                />
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="advanced" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="searchProvider">{t("configUrlGenerator.searchProvider")}</Label>
                <select
                  id="searchProvider"
                  className="w-full p-2 border rounded"
                  value={config.searchProvider || ""}
                  onChange={(e) => handleConfigChange("searchProvider", e.target.value)}
                >
                  <option value="model">模型内置</option>
                  <option value="tavily">Tavily</option>
                  <option value="firecrawl">Firecrawl</option>
                  <option value="exa">Exa</option>
                  <option value="bocha">Bocha</option>
                  <option value="searxng">SearXNG</option>
                </select>
              </div>
              
              <div>
                <Label htmlFor="searchMaxResult">{t("configUrlGenerator.searchMaxResult")}</Label>
                <Input
                  id="searchMaxResult"
                  type="number"
                  placeholder="5"
                  value={config.searchMaxResult || ""}
                  onChange={(e) => handleConfigChange("searchMaxResult", e.target.value)}
                />
              </div>
              
              <div>
                <Label htmlFor="language">{t("configUrlGenerator.language")}</Label>
                <select
                  id="language"
                  className="w-full p-2 border rounded"
                  value={config.language || ""}
                  onChange={(e) => handleConfigChange("language", e.target.value)}
                >
                  <option value="zh-CN">简体中文</option>
                  <option value="en-US">English</option>
                  <option value="es-ES">Español</option>
                </select>
              </div>
              
              <div>
                <Label htmlFor="theme">{t("configUrlGenerator.theme")}</Label>
                <select
                  id="theme"
                  className="w-full p-2 border rounded"
                  value={config.theme || ""}
                  onChange={(e) => handleConfigChange("theme", e.target.value)}
                >
                  <option value="system">跟随系统</option>
                  <option value="light">浅色</option>
                  <option value="dark">深色</option>
                </select>
              </div>
            </div>
          </TabsContent>
        </Tabs>
        
        <div className="mt-6 space-y-4">
          <Button onClick={handleGenerate} className="w-full">
            {t("configUrlGenerator.generate")}
          </Button>
          
          {generatedUrl && (
            <div className="space-y-2">
              <Label>{t("configUrlGenerator.generatedUrl")}:</Label>
              <div className="flex gap-2">
                <Textarea
                  readOnly
                  value={generatedUrl}
                  rows={3}
                  className="font-mono text-sm"
                />
                <div className="flex flex-col gap-2">
                  <Button variant="outline" size="icon" onClick={handleCopy}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={handleOpen}>
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
        
        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
          <h4 className="font-semibold mb-2">{t("configUrlGenerator.usageInstructions")}:</h4>
          <ul className="text-sm space-y-1 text-gray-600 dark:text-gray-400">
            <li>• {t("configUrlGenerator.usageNote1")}</li>
            <li>• {t("configUrlGenerator.usageNote2")}</li>
            <li>• {t("configUrlGenerator.usageNote3")}</li>
            <li>• {t("configUrlGenerator.usageNote4")}</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
