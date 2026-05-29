import { useState } from "react";
import { Wrench } from "lucide-react";
import YoutubeSummarizer from "./YoutubeSummarizer";
import DoubtInput from "../doubts/DoubtInput";
import ConceptExplorerWorkspace from "./ConceptExplorerWorkspace";

// ── Main Quick Tools Page ────────────────────────────────────────
const QuickTools = () => {
  const [activeTab, setActiveTab] = useState<"youtube" | "concept" | "doubt">("youtube");

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-[#1D4ED8]/10 flex items-center justify-center">
          <Wrench className="h-5 w-5 text-[#1D4ED8]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Quick Tools</h1>
          <p className="text-gray-500 text-sm">AI study assistants to supercharge your learning sessions</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-2 border-b border-gray-100 pb-4 overflow-x-auto">
        <button
          onClick={() => setActiveTab("youtube")}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
            activeTab === "youtube" ? "bg-[#0F172A] text-white shadow-md" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
          }`}
        >
          📺 YouTube Summarizer
        </button>
        <button
          onClick={() => setActiveTab("concept")}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
            activeTab === "concept" ? "bg-[#0F172A] text-white shadow-md" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
          }`}
        >
          🧠 Concept Explorer
        </button>
        <button
          onClick={() => setActiveTab("doubt")}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
            activeTab === "doubt" ? "bg-[#0F172A] text-white shadow-md" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
          }`}
        >
          ❓ Ask Doubt
        </button>
      </div>

      {/* Content */}
      <div className="min-h-[600px] -mx-6 md:-mx-8">
        {activeTab === "youtube" && (
          <div className="px-6 md:px-8">
            <YoutubeSummarizer />
          </div>
        )}
        {activeTab === "concept" && (
          <div className="px-6 md:px-8">
            <ConceptExplorerWorkspace />
          </div>
        )}
        {activeTab === "doubt" && <DoubtInput />}
      </div>
    </div>
  );
};

export default QuickTools;
