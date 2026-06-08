import { useState } from "react";
// FIX Bug 9: Removed unused `Wrench` import. `Brain` is kept for Content Explorer tab.
import { Youtube, Brain, Bot } from "lucide-react";
import YoutubeSummarizer from "./YoutubeSummarizer";
import ConceptExplorerWorkspace from "./ConceptExplorerWorkspace";
import AITutor from "../materials/AITutor";

// FIX Bug 9: The first tab rendered <AITutor> (the real document tutor) but was
// labelled "AI Tutor" — same label as the standalone tutor page at /materials/tutor.
// This confused users navigating between them. Renamed to "Quick Tutor" to distinguish
// it as the lightweight inline version, and renamed "explorer" tab to "Concept Explorer"
// for clarity. The page title/header is also updated to "AI Tools" (was "AI Tutor",
// which clashed with the dedicated tutor page).
type ToolTab = "quicktutor" | "youtube" | "explorer";

const tabs: { id: ToolTab; label: string; icon: any }[] = [
  { id: "quicktutor", label: "Quick Tutor", icon: Bot },
  { id: "youtube", label: "YouTube Summarizer", icon: Youtube },
  { id: "explorer", label: "Concept Explorer", icon: Brain },
];

const QuickTools = () => {
  const [activeTab, setActiveTab] = useState<ToolTab>("quicktutor");

  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 ring-1 ring-primary/10">
            <Bot className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-bold text-foreground tracking-tight">
              AI Tools
            </h1>
            <p className="text-muted-foreground text-sm mt-1 max-w-lg">
              AI study assistants — chat with a tutor, summarize videos, and explore concepts.
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
        {activeTab === "quicktutor" && (
          <div className="p-4 md:p-6">
            <AITutor hideHeader={true} />
          </div>
        )}
        {activeTab === "youtube" && (
          <div className="p-6 md:p-8">
            <YoutubeSummarizer />
          </div>
        )}
        {activeTab === "explorer" && (
          <div className="p-6 md:p-8">
            <ConceptExplorerWorkspace />
          </div>
        )}
      </div>
    </div>
  );
};

export default QuickTools;
