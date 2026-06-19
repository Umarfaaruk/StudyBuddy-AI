import { useState, useRef } from "react";
import { useLocation } from "react-router-dom";
import { Camera, Send, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { aiVisionComplete, ChatMessage } from "@/lib/aiService";
import ReactMarkdown from "react-markdown";

const CameraQnA = () => {
  const location = useLocation();
  const preloaded = location.state as { preloadedImage?: string; preloadedQuestion?: string } | null;
  const [imagePreview, setImagePreview] = useState<string | null>(preloaded?.preloadedImage || null);
  const [question, setQuestion] = useState(preloaded?.preloadedQuestion || "");
  const [answer, setAnswer] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please upload a valid image file.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
      setAnswer("");
    };
    reader.readAsDataURL(file);
  };

  const clearImage = () => {
    setImagePreview(null);
    setQuestion("");
    setAnswer("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const askAI = async () => {
    if (!imagePreview) {
      toast.error("Please capture or upload an image first.");
      return;
    }
    if (!question.trim()) {
      toast.error("Please ask a question about the image.");
      return;
    }

    setIsProcessing(true);
    setAnswer("");
    
    try {
      const messages: ChatMessage[] = [
        {
          role: "user",
          content: [
            { type: "text", text: question },
            { type: "image_url", image_url: { url: imagePreview } }
          ]
        }
      ];

      const response = await aiVisionComplete({ messages });
      setAnswer(response);
    } catch (error: any) {
      console.error("AI Vision error:", error);
      toast.error(error.message || "Failed to analyze image. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="container max-w-2xl py-8 px-4 md:py-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-8 space-y-2">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Camera className="h-8 w-8 text-primary" />
          Ask Doubt — Image Q&A
        </h1>
        <p className="text-muted-foreground">
          Take a photo of a math problem, a diagram, or any text to get instant AI-powered explanations.
        </p>
      </div>

      <Card className="border-border/50 shadow-sm">
        <CardHeader>
          <CardTitle>Image Q&A</CardTitle>
          <CardDescription>
            Upload or snap a picture, then ask what you want to know.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          
          {/* Image Input Area */}
          {!imagePreview ? (
            <div className="border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center justify-center bg-muted/30 text-center gap-4 transition-colors hover:bg-muted/50 cursor-pointer"
                 onClick={() => fileInputRef.current?.click()}>
              <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                <Camera className="h-8 w-8" />
              </div>
              <div>
                <p className="font-medium text-foreground">Tap to open Camera or Gallery</p>
                <p className="text-sm text-muted-foreground mt-1">Supports JPEG, PNG, WEBP</p>
              </div>
              <input 
                type="file" 
                accept="image/*" 
                capture="environment" 
                className="hidden" 
                ref={fileInputRef}
                onChange={handleImageCapture}
              />
            </div>
          ) : (
            <div className="relative rounded-xl overflow-hidden border border-border bg-black/5 flex items-center justify-center">
              <img src={imagePreview} alt="Captured preview" className="max-h-[400px] w-auto object-contain" />
              <button 
                onClick={clearImage}
                className="absolute top-2 right-2 bg-black/60 text-white p-1.5 rounded-full hover:bg-black transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          )}

          {/* Question Input */}
          <div className="space-y-3">
            <label className="text-sm font-medium">What's your question?</label>
            <Textarea 
              placeholder="e.g., Solve this equation, explain this diagram, or translate this text..."
              className="resize-none min-h-[100px]"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              disabled={!imagePreview || isProcessing}
            />
          </div>

          <Button 
            className="w-full" 
            size="lg" 
            onClick={askAI} 
            disabled={!imagePreview || !question.trim() || isProcessing}
          >
            {isProcessing ? (
              <>
                <RefreshCw className="h-5 w-5 mr-2 animate-spin" />
                Analyzing Image...
              </>
            ) : (
              <>
                <Send className="h-5 w-5 mr-2" />
                Ask AI
              </>
            )}
          </Button>

          {/* Answer Area */}
          {answer && (
            <div className="mt-6 p-4 rounded-xl bg-primary/5 border border-primary/20">
              <h3 className="font-semibold text-primary mb-2 flex items-center gap-2">
                <Send className="h-4 w-4" />
                AI Answer
              </h3>
              <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed">
                <ReactMarkdown>{answer}</ReactMarkdown>
              </div>
            </div>
          )}

        </CardContent>
      </Card>
    </div>
  );
};

export default CameraQnA;
