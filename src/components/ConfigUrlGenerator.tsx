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
      toast.success("URL已复制到剪贴板");
    } catch (error) {
      toast.error("复制失败");
    }
  };

  const handleOpen = () => {
    window.open(generatedUrl, '_blank');
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>配置URL生成器</CardTitle>
        <CardDescription>
          生成带有预配置参数的URL，方便快速启动Deep Research应用
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="basic">基础配置</TabsTrigger>
            <TabsTrigger value="auth">认证配置</TabsTrigger>
            <TabsTrigger value="advanced">高级配置</TabsTrigger>
          </TabsList>
          
          <TabsContent value="basic" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="provider">AI厂商</Label>
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
                <Label htmlFor="apiKey">API密钥</Label>
                <Input
                  id="apiKey"
                  type="password"
                  placeholder="输入API密钥"
                  value={config.apiKey || ""}
                  onChange={(e) => handleConfigChange("apiKey", e.target.value)}
                />
              </div>
              
              <div>
                <Label htmlFor="thinkingModel">思考模型</Label>
                <Input
                  id="thinkingModel"
                  placeholder="例如: gemini-2.0-flash-thinking-exp"
                  value={config.thinkingModel || ""}
                  onChange={(e) => handleConfigChange("thinkingModel", e.target.value)}
                />
              </div>
              
              <div>
                <Label htmlFor="taskModel">任务模型</Label>
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
                <Label htmlFor="jwt">JWT令牌</Label>
                <Textarea
                  id="jwt"
                  placeholder="输入JWT令牌用于数据中心认证"
                  value={config.jwt || ""}
                  onChange={(e) => handleConfigChange("jwt", e.target.value)}
                  rows={3}
                />
              </div>
              
              <div>
                <Label htmlFor="topicId">话题ID</Label>
                <Input
                  id="topicId"
                  placeholder="输入话题ID以加载历史记录"
                  value={config.topicId || ""}
                  onChange={(e) => handleConfigChange("topicId", e.target.value)}
                />
              </div>
              
              <div>
                <Label htmlFor="accessPassword">访问密码</Label>
                <Input
                  id="accessPassword"
                  type="password"
                  placeholder="输入访问密码"
                  value={config.accessPassword || ""}
                  onChange={(e) => handleConfigChange("accessPassword", e.target.value)}
                />
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="advanced" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="searchProvider">搜索提供商</Label>
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
                <Label htmlFor="searchMaxResult">最大搜索结果数</Label>
                <Input
                  id="searchMaxResult"
                  type="number"
                  placeholder="5"
                  value={config.searchMaxResult || ""}
                  onChange={(e) => handleConfigChange("searchMaxResult", e.target.value)}
                />
              </div>
              
              <div>
                <Label htmlFor="language">界面语言</Label>
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
                <Label htmlFor="theme">主题</Label>
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
            生成配置URL
          </Button>
          
          {generatedUrl && (
            <div className="space-y-2">
              <Label>生成的URL:</Label>
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
          <h4 className="font-semibold mb-2">使用说明:</h4>
          <ul className="text-sm space-y-1 text-gray-600 dark:text-gray-400">
            <li>• 填写需要预配置的参数，留空的参数将不会包含在URL中</li>
            <li>• JWT令牌和API密钥等敏感信息会在页面加载后自动从URL中清除</li>
            <li>• 话题ID用于从数据中心加载历史对话记录</li>
            <li>• 生成的URL可以分享给他人快速启动相同配置的应用</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
