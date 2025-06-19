"use client";
import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/Internal/Button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import useDeepResearch from "@/hooks/useDeepResearch";
import useAccurateTimer from "@/hooks/useAccurateTimer";
import { useChatHistory } from "@/hooks/useChatHistory";
import { useTaskStore } from "@/store/task";

const MagicDown = dynamic(() => import("@/components/MagicDown"));

const formSchema = z.object({
  feedback: z.string(),
});

function Feedback() {
  const { t } = useTranslation();
  const taskStore = useTaskStore();
  const { status, deepResearch, writeReportPlan } = useDeepResearch();
  const {
    formattedTime,
    start: accurateTimerStart,
    stop: accurateTimerStop,
  } = useAccurateTimer();
  const chatHistory = useChatHistory();
  const [isThinking, setIsThinking] = useState<boolean>(false);
  const [isResearch, setIsResaerch] = useState<boolean>(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      feedback: taskStore.feedback,
    },
  });

  async function startDeepResearch() {
    try {
      accurateTimerStart();
      setIsResaerch(true);
      await deepResearch();
    } finally {
      setIsResaerch(false);
      accurateTimerStop();
    }
  }
  async function handleSubmit(values: z.infer<typeof formSchema>) {
    const { question, questions, setFeedback } = useTaskStore.getState();
    setFeedback(values.feedback);
    
    // 保存用户反馈到数据中心
    if (chatHistory.currentTopicId && values.feedback) {
      await chatHistory.saveFeedback(values.feedback);
    }
    
    const prompt = [
      `Initial Query: ${question}`,
      `Follow-up Questions: ${questions}`,
      `Follow-up Feedback: ${values.feedback}`,
    ].join("\n\n");
    taskStore.setQuery(prompt);
    try {
      accurateTimerStart();
      setIsThinking(true);
      await writeReportPlan();
      setIsThinking(false);
    } finally {
      accurateTimerStop();
    }
  }

  useEffect(() => {
    form.setValue("feedback", taskStore.feedback);
  }, [taskStore.feedback, form]);
    return (
    <section className="p-6 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border border-green-200 dark:border-green-800 mt-4 print:hidden shadow-sm">      <div className="flex items-center gap-3 mb-4 pb-3 border-b border-green-200 dark:border-green-700">
        <div className="w-8 h-8 bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400 flex items-center justify-center border border-green-200 dark:border-green-800">
          <span className="text-sm">📊</span>
        </div>
        <h3 className="font-semibold text-lg text-green-800 dark:text-green-200">
          {t("research.feedback.title")}
        </h3>
      </div>
      {taskStore.questions === "" ? (
        <div className="text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/50 p-4 border-l-4 border-green-400 flex items-center gap-3">
          <span className="text-lg">⏳</span>
          <div>
            <div className="font-medium">等待思考阶段完成</div>
            <div className="text-sm opacity-75">{t("research.feedback.emptyTip")}</div>
          </div>
        </div>
      ) : (
        <div>
          <h4 className="mt-4 text-base font-semibold">
            {t("research.feedback.questions")}
          </h4>
          <MagicDown
            className="mt-2 min-h-20"
            value={taskStore.questions}
            onChange={(value) => taskStore.updateQuestions(value)}
          ></MagicDown>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)}>
              <FormField
                control={form.control}
                name="feedback"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="mb-2 font-semibold">
                      {t("research.feedback.feedbackLabel")}
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        rows={3}
                        placeholder={t("research.feedback.feedbackPlaceholder")}
                        disabled={isThinking}
                        {...field}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <Button
                className="mt-4 w-full"
                type="submit"
                disabled={isThinking}
              >
                {isThinking ? (
                  <>
                    <LoaderCircle className="animate-spin" />
                    <span>{status}</span>
                    <small className="font-mono">{formattedTime}</small>
                  </>
                ) : taskStore.reportPlan === "" ? (
                  t("research.common.writeReportPlan")
                ) : (
                  t("research.common.rewriteReportPlan")
                )}
              </Button>
            </form>
          </Form>
        </div>
      )}
      {taskStore.reportPlan !== "" ? (
        <div className="mt-6">
          <h4 className="text-base font-semibold">
            {t("research.feedback.reportPlan")}
          </h4>
          <MagicDown
            className="mt-2 min-h-20"
            value={taskStore.reportPlan}
            onChange={(value) => taskStore.updateReportPlan(value)}
          ></MagicDown>
          <Button
            className="w-full mt-4"
            variant="default"
            onClick={() => startDeepResearch()}
            disabled={isResearch}
          >
            {isResearch ? (
              <>
                <LoaderCircle className="animate-spin" />
                <span>{status}</span>
                <small className="font-mono">{formattedTime}</small>
              </>
            ) : taskStore.tasks.length === 0 ? (
              t("research.common.startResearch")
            ) : (
              t("research.common.restartResearch")
            )}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

export default Feedback;
