import { useState } from "react";
import { Wrench, Youtube, Brain, MessageCircleQuestion } from "lucide-react";
import YoutubeSummarizer from "./YoutubeSummarizer";
import DoubtInput from "../doubts/DoubtInput";
import ConceptExplorerWorkspace from "./ConceptExplorerWorkspace";

type ToolTab = "youtube" | "concept" | "doubt";

const tabs: { id: ToolTab; label: string; icon: typeof Youtube; description: string }[] = [
  {
    id: "youtube",
    label: "YouTube Summarizer",
    icon: Youtube,
    description: "Summarize lectures and tutorials from captions",
  },
  {
    id: "concept",
    label: "Concept Explorer",
    icon: Brain,
    description: "Visualize and break down complex topics",
  },
  {
    id: "doubt",
    label: "Ask Doubt",
    icon: MessageCircleQuestion,
    description: "Get step-by-step help on any question",
  },
];

const QuickTools = () => {
  const [activeTab, setActiveTab] = useState<ToolTab>("youtube");

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8">
      <div className="flex items-start gap-4">
        <div className="h-11 w-11 rounded-xl bg-[#0F172A]/5 flex items-center justify-center shrink-0">
          <Wrench className="h-5 w-5 text-[#0F172A]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Quick Tools</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            AI-powered study assistants for faster learning
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`text-left rounded-2xl border p-4 transition-all duration-200 ${
                isActive
                  ? "border-[#0F172A] bg-[#0F172A] text-white shadow-md"
                  : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:shadow-sm"
              }`}
            >
              <div className="flex items-center gap-2.5 mb-1.5">
                <Icon className={`h-4 w-4 ${isActive ? "text-white" : "text-[#1D4ED8]"}`} />
                <span className="text-sm font-semibold">{tab.label}</span>
              </div>
              <p className={`text-xs leading-relaxed ${isActive ? "text-white/70" : "text-gray-500"}`}>
                {tab.description}
              </p>
            </button>
          );
        })}
      </div>

      <div className="min-h-[600px] rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
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
        {activeTab === "doubt" && <DoubtInput />}
      </div>
    </div>
  );
};

export default QuickTools;
