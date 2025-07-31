"use client";
import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  LoaderCircle,
  SquarePlus,
  FilePlus,
  BookText,
  Paperclip,
  Link,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import ResourceList from "@/components/Knowledge/ResourceList";
import Crawler from "@/components/Knowledge/Crawler";
import { Button } from "@/components/Internal/Button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import useDeepResearch from "@/hooks/useDeepResearch";
import useAiProvider from "@/hooks/useAiProvider";
import useKnowledge from "@/hooks/useKnowledge";
import useAccurateTimer from "@/hooks/useAccurateTimer";
import { useGlobalStore } from "@/store/global";
import { useSettingStore } from "@/store/setting";
import { useTaskStore } from "@/store/task";
import { useHistoryStore } from "@/store/history";
import { useAuthStore } from "@/store/auth";

const formSchema = z.object({
  topic: z.string().min(2),
});

function Topic() {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const taskStore = useTaskStore();
  const { askQuestions } = useDeepResearch();
  const { hasApiKey } = useAiProvider();
  const { getKnowledgeFromFile } = useKnowledge();
  const {
    formattedTime,
    start: accurateTimerStart,
    stop: accurateTimerStop,
  } = useAccurateTimer();
  const [isThinking, setIsThinking] = useState<boolean>(false);
  const [openCrawler, setOpenCrawler] = useState<boolean>(false);
  const [hasHydrated, setHasHydrated] = useState<boolean>(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      topic: taskStore.question,
    },
  });

  function handleCheck(): boolean {
    // Wait for hydration to complete before checking configuration
    if (!hasHydrated) {
      // During hydration, don't show settings dialog
      return true;
    }
    
    const { mode } = useSettingStore.getState();
    if ((mode === "local" && hasApiKey()) || mode === "proxy") {
      return true;
    } else {
      // Only show settings dialog if we're not in a valid state
      if ((mode === "local" && !hasApiKey()) || (mode === "" && !hasApiKey()) || (mode !== "local" && mode !== "proxy")) {
        const { setOpenSetting } = useGlobalStore.getState();
        setOpenSetting(true);
      }
      return false;
    }
  }

  async function handleSubmit(values: z.infer<typeof formSchema>) {
    if (handleCheck()) {
      const { id, setQuestion } = useTaskStore.getState();
      try {
        setIsThinking(true);
        accurateTimerStart();
        if (id !== "") {
          createNewResearch();
          form.setValue("topic", values.topic);
        }
        setQuestion(values.topic);
        await askQuestions();
      } finally {
        setIsThinking(false);
        accurateTimerStop();
      }
    }
  }
  function createNewResearch() {
    const { id, backup, reset } = useTaskStore.getState();
    const { update } = useHistoryStore.getState();
    const { setTopicId } = useAuthStore.getState();
    if (id) update(id, backup());
    reset();
    setTopicId(''); // 清空话题ID，表示开始新研究
    form.reset();
  }

  function openKnowledgeList() {
    const { setOpenKnowledge } = useGlobalStore.getState();
    setOpenKnowledge(true);
  }

  async function handleFileUpload(files: FileList | null) {
    if (files) {
      for await (const file of files) {
        await getKnowledgeFromFile(file);
      }
      // Clear the input file to avoid processing the previous file multiple times
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  useEffect(() => {
    form.setValue("topic", taskStore.question);
  }, [taskStore.question, form]);

  // Track hydration status from the store
  useEffect(() => {
    const unsubscribe = useSettingStore.subscribe((state) => {
      if (state._hasHydrated && !hasHydrated) {
        setHasHydrated(true);
      }
    });
    
    // Check if already hydrated
    if (useSettingStore.getState()._hasHydrated) {
      setHasHydrated(true);
    }
    
    return unsubscribe;
  }, [hasHydrated]);

  // Re-check configuration after hydration is complete
  useEffect(() => {
    if (hasHydrated) {
      // Small delay to ensure all state is fully loaded
      const timer = setTimeout(() => {
        // Only show settings if not already configured properly
        const { mode } = useSettingStore.getState();
        if ((mode === "local" && !hasApiKey()) || (mode === "" && !hasApiKey())) {
          const { setOpenSetting } = useGlobalStore.getState();
          setOpenSetting(true);
        }
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [hasHydrated, hasApiKey]);
  return (
    <section className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-200 dark:border-blue-800 mt-4 print:hidden shadow-sm">
      <div className="flex justify-between items-center border-b border-blue-200 dark:border-blue-700 mb-4 pb-3">        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-200 dark:border-blue-800">
            <span className="text-sm">🔍</span>
          </div>
          <h3 className="font-semibold text-lg text-blue-800 dark:text-blue-200">
            {t("research.topic.title")}
          </h3>
        </div><div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => createNewResearch()}
            title={t("research.common.newResearch")}
            className="hover:bg-blue-100 dark:hover:bg-blue-900 text-blue-600 dark:text-blue-400"
          >
            <SquarePlus />
          </Button>
        </div>
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <FormField
            control={form.control}
            name="topic"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="mb-2 text-base font-semibold">
                  {t("research.topic.topicLabel")}
                </FormLabel>
                <FormControl>
                  <Textarea
                    rows={3}
                    placeholder={t("research.topic.topicPlaceholder")}
                    {...field}
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <FormItem className="mt-2">
            <FormLabel className="mb-2 text-base font-semibold">
              {t("knowledge.localResourceTitle")}
            </FormLabel>
            <FormControl onSubmit={(ev) => ev.stopPropagation()}>
              <div>
                {taskStore.resources.length > 0 ? (
                  <ResourceList
                    className="pb-2 mb-2 border-b"
                    resources={taskStore.resources}
                    onRemove={taskStore.removeResource}
                  />
                ) : null}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <div className="inline-flex border p-2 rounded-md text-sm cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800">
                      <FilePlus className="w-5 h-5" />
                      <span className="ml-1">{t("knowledge.addResource")}</span>
                    </div>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => openKnowledgeList()}>
                      <BookText />
                      <span>{t("knowledge.knowledge")}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        handleCheck() && fileInputRef.current?.click()
                      }
                    >
                      <Paperclip />
                      <span>{t("knowledge.localFile")}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleCheck() && setOpenCrawler(true)}
                    >
                      <Link />
                      <span>{t("knowledge.webPage")}</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </FormControl>
          </FormItem>
          <Button className="w-full mt-4" disabled={isThinking} type="submit">
            {isThinking ? (
              <>
                <LoaderCircle className="animate-spin" />
                <span>{t("research.common.thinkingQuestion")}</span>
                <small className="font-mono">{formattedTime}</small>
              </>
            ) : taskStore.questions === "" ? (
              t("research.common.startThinking")
            ) : (
              t("research.common.rethinking")
            )}
          </Button>
        </form>
      </Form>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={(ev) => handleFileUpload(ev.target.files)}
      />
      <Crawler
        open={openCrawler}
        onClose={() => setOpenCrawler(false)}
      ></Crawler>
    </section>
  );
}

export default Topic;
