"use client";
import { useTranslation } from "react-i18next";
import { History, BookText, Settings } from "lucide-react";
import { Button } from "@/components/Internal/Button";
import { useGlobalStore } from "@/store/global";

function Header() {
  const { t } = useTranslation();
  const { setOpenHistory, setOpenKnowledge, setOpenSetting } = useGlobalStore();

  return (
    <>
      <header className="flex justify-between items-center my-6 max-sm:my-4 print:hidden">
        {/* 
        <a href="https://github.com/u14app/deep-research" target="_blank">
          <h1 className="text-left text-xl font-semibold">
            {t("title")}
            <small className="ml-2 font-normal text-base">v{VERSION}</small>
          </h1>
        </a> 
        */}
        <div className="flex items-center gap-1">
          <Button
            className="h-8 w-8 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            variant="ghost"
            size="icon"
            title={t("history.title")}
            onClick={() => setOpenHistory(true)}
          >
            <History className="h-4 w-4" />
          </Button>
          <Button
            className="h-8 w-8 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
            variant="ghost"
            size="icon"
            title={t("knowledge.title")}
            onClick={() => setOpenKnowledge(true)}
          >
            <BookText className="h-4 w-4" />
          </Button>
          <Button
            className="h-8 w-8 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-orange-600 dark:hover:text-orange-400 transition-colors hidden"
            title={t("setting.title")}
            variant="ghost"
            size="icon"
            onClick={() => setOpenSetting(true)}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </header>
    </>
  );
}

export default Header;
