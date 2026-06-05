import { useState } from "react";
import { Wrench, Youtube, Brain, Bot } from "lucide-react";
import YoutubeSummarizer from "./YoutubeSummarizer";
import ConceptExplorerWorkspace from "./ConceptExplorerWorkspace";

type ToolTab = "youtube" | "concept";

const tabs: { id: ToolTab; label: string; icon: any }[] = [
  { id: "concept", label: "AI Tutor", icon: Bot },
  { id: "youtube", label: "YouTube Summarizer", icon: Youtube },
];

const QuickTools = () => {
  const [activeTab, setActiveTab] = useState<ToolTab>("concept");

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 ring-1 ring-primary/10">
            <Bot className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-bold text-foreground tracking-tight">
              AI Tutor
            </h1>
            <p className="text-muted-foreground text-sm mt-1 max-w-lg">
              AI study assistants — learn with AI tutor and summarize videos in one place.
            </p>
          </div>
        </div>
      </div>

      <div className="inline-flex p-1 rounded-xl bg-muted/80 border border-border">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className={`h-4 w-4 ${isActive ? "text-primary" : ""}`} />
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.label.split(" ")[0]}</span>
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-border bg-card/50 shadow-sm overflow-hidden min-h-[560px]">
        {activeTab === "youtube" && (
          <div className="p-6 md:p-8">
            <YoutubeSummarizer />
          </div>
        )}
        {activeTab === "concept" && (
          <div className="p-6 md:p-8">
            <ConceptExplorerWorkspace />
          </div>
        )}
      </div>
    </div>
  );
};

export default QuickTools;
