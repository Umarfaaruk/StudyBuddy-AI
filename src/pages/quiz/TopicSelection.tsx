import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Gamepad2, FileText, BrainCircuit, Youtube, Loader2, PlayCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";

const PracticeArena = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [difficulty, setDifficulty] = useState("Medium");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [isProcessingYoutube, setIsProcessingYoutube] = useState(false);

  const handleYoutubeQuiz = async () => {
    if (!youtubeUrl.trim()) {
      toast.error("Please enter a YouTube URL");
      return;
    }

    try {
      setIsProcessingYoutube(true);
      const res = await fetch(`/api/youtube-transcript?url=${encodeURIComponent(youtubeUrl.trim())}`);
      if (!res.ok) {
        throw new Error("Failed to process YouTube video");
      }
      
      const data = await res.json();
      if (!data.hasTranscript || !data.transcript) {
        toast.error("No transcript found for this video");
        return;
      }

      // Navigate to quiz viewer with the transcript as materialContext
      navigate(`/quiz/youtube-${data.videoId}`, {
        state: {
          topicTitle: data.title,
          subjectName: "YouTube Video",
          materialContext: data.transcript.substring(0, 5000), // passing limited transcript for quiz generation context
          difficulty
        }
      });
    } catch (error) {
      console.error(error);
      toast.error("Error processing YouTube video");
    } finally {
      setIsProcessingYoutube(false);
    }
  };

  // Fetch user materials
  const { data: materials, isLoading: materialsLoading } = useQuery({
    queryKey: ["user-materials", user?.uid],
    queryFn: async () => {
      if (!user) return [];
      try {
        const q = query(collection(db, "materials"), where("user_id", "==", user.uid));
        const snap = await getDocs(q);
        return snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
      } catch (e) {
        console.error("Error fetching materials:", e);
        return [];
      }
    },
    enabled: !!user,
  });

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Practice Arena</h1>
        <p className="text-gray-500 text-[15px] mt-2 max-w-xl leading-relaxed">
          Generate custom AI quizzes or flashcards directly from your uploaded study materials.
        </p>
      </div>

      {/* Difficulty Selector */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 md:p-6 flex items-center justify-between gap-4 flex-wrap shadow-sm">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Quiz Difficulty</h3>
          <p className="text-xs text-gray-400 mt-0.5">Adjust the complexity of the quiz questions</p>
        </div>
        <div className="flex gap-2">
          {["Easy", "Medium", "Hard"].map((lvl) => (
            <button
              key={lvl}
              onClick={() => setDifficulty(lvl)}
              className={`px-5 py-2 rounded-full text-xs font-bold border-2 transition-all duration-200 ${
                difficulty === lvl
                  ? "bg-[#1D4ED8] text-white border-[#1D4ED8] shadow-md shadow-[#1D4ED8]/20"
                  : "bg-white text-gray-500 border-gray-200 hover:border-[#1D4ED8]/40 hover:text-[#1D4ED8]"
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>
      </div>

      {/* YouTube Quiz Generator */}
      <div className="bg-gradient-to-br from-red-50 to-white border border-red-100 rounded-2xl p-5 md:p-6 shadow-sm">
        <div className="flex items-start gap-4 flex-col md:flex-row md:items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Youtube className="h-5 w-5 text-red-600" />
              <h3 className="text-sm font-bold text-gray-900">Quiz from YouTube</h3>
            </div>
            <p className="text-xs text-gray-500">Paste a YouTube link to instantly generate a quiz based on the video.</p>
          </div>
          <div className="flex w-full md:w-auto gap-2 items-center">
            <Input
              placeholder="https://youtube.com/watch?v=..."
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              className="bg-white text-xs max-w-[250px] md:w-[250px]"
              disabled={isProcessingYoutube}
            />
            <Button
              onClick={handleYoutubeQuiz}
              disabled={isProcessingYoutube || !youtubeUrl.trim()}
              className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold gap-1.5 shadow-sm shadow-red-600/20"
            >
              {isProcessingYoutube ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
              Generate
            </Button>
          </div>
        </div>
      </div>

      {/* User Materials grid */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 tracking-tight mb-5">Your Study Materials</h2>
        
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {materialsLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <Skeleton className="h-44 w-full rounded-none" />
                <div className="p-4 space-y-3">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <div className="flex gap-2 pt-2">
                    <Skeleton className="h-9 flex-1 rounded-lg" />
                    <Skeleton className="h-9 flex-1 rounded-lg" />
                  </div>
                </div>
              </div>
            ))
          ) : materials?.length ? (
            materials?.map((m) => (
              <div
                key={m.id}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg hover:border-[#1D4ED8]/30 transition-all duration-300 overflow-hidden flex flex-col group"
              >
                {/* Thumbnail Area */}
                <div className="relative h-44 bg-gradient-to-br from-gray-100 to-gray-50 flex items-center justify-center overflow-hidden">
                  <FileText className="h-12 w-12 text-gray-300 group-hover:text-[#1D4ED8]/30 transition-colors duration-300" />
                  {/* PDF Badge */}
                  <span className="absolute top-3 left-3 bg-[#1D4ED8]/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wide">
                    PDF Document
                  </span>
                </div>

                {/* Card Body */}
                <div className="p-4 flex flex-col flex-1">
                  <h3 className="text-sm font-semibold text-gray-900 truncate leading-snug">{m.file_name}</h3>
                  <p className="text-[11px] text-gray-400 mt-1">
                    Added recently • Uploaded Material
                  </p>

                  <div className="flex gap-2 mt-auto pt-4">
                    <Link
                      to={`/quiz/${m.id}`}
                      state={{ 
                        topicTitle: m.file_name, 
                        subjectName: "Your Material",
                        materialContext: m.summary || m.extracted_text?.substring(0, 5000) || "",
                        difficulty
                      }}
                      className="flex-1"
                    >
                      <Button
                        size="sm"
                        className="w-full bg-[#1D4ED8] hover:bg-[#2563EB] text-white text-xs font-bold gap-1.5 rounded-lg shadow-sm shadow-[#1D4ED8]/20 transition-all duration-200"
                      >
                        <Gamepad2 className="h-3.5 w-3.5" /> Quiz
                      </Button>
                    </Link>
                    <Link
                      to={`/materials/flashcards`}
                      state={{ preselectedMaterial: m }}
                      className="flex-1"
                    >
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full text-xs font-bold gap-1.5 rounded-lg border-gray-200 text-gray-600 hover:border-[#1D4ED8]/40 hover:text-[#1D4ED8] transition-all duration-200"
                      >
                        <BrainCircuit className="h-3.5 w-3.5" /> Flashcards
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-full text-center py-16 bg-gray-50/60 rounded-2xl border-2 border-dashed border-gray-200">
              <div className="h-14 w-14 rounded-2xl bg-[#1D4ED8]/10 flex items-center justify-center mx-auto mb-4">
                <FileText className="h-7 w-7 text-[#1D4ED8]/50" />
              </div>
              <p className="text-sm text-gray-500 mb-1 font-medium">No materials uploaded yet</p>
              <p className="text-xs text-gray-400 mb-5">Upload a PDF or text to start practicing!</p>
              <Link to="/materials">
                <Button size="sm" className="bg-[#1D4ED8] hover:bg-[#2563EB] text-white font-bold rounded-lg px-6 shadow-sm shadow-[#1D4ED8]/20">
                  Upload Material
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PracticeArena;

