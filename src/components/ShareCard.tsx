import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { Share2, Download, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * SHAREABLE RESULT CARD  (Phase 4.3)
 * ==================================
 * Renders an achievement as an image and offers a WhatsApp share, since
 * WhatsApp is the primary sharing channel for this audience.
 *
 * Drawn on a <canvas> rather than rasterising DOM: html2canvas-style libraries
 * are heavy, fragile across browsers, and would pull a large dependency into
 * the bundle for one feature. A hand-drawn card is a few dozen lines, renders
 * identically everywhere, and needs nothing installed.
 *
 * WhatsApp's share URL cannot carry an image — it takes text only. So the
 * button shares a caption plus a link, and the image is offered as a separate
 * download the student can attach. Pretending otherwise would produce a share
 * that silently drops the picture.
 */

interface Props {
  headline: string;
  subline?: string;
  /** Link appended to the shared text. Defaults to the free test. */
  shareUrl?: string;
}

const W = 1080;
const H = 1080;

const ShareCard = ({ headline, subline, shareUrl }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [copied, setCopied] = useState(false);

  const url = shareUrl ?? `${window.location.origin}/free-test`;

  /** Draw the card. Square, because that is what chat apps preview best. */
  const draw = useCallback((): HTMLCanvasElement | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    canvas.width = W;
    canvas.height = H;

    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#0F172A");
    bg.addColorStop(1, "#1E293B");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#6366F1";
    ctx.fillRect(0, 0, W, 12);

    // Wordmark
    ctx.font = "700 44px Inter, system-ui, sans-serif";
    ctx.fillStyle = "#F8FAFC";
    ctx.fillText("StudyBuddy", 80, 140);
    const wordWidth = ctx.measureText("StudyBuddy").width;
    ctx.fillStyle = "#F97316";
    ctx.fillText(" AI", 80 + wordWidth, 140);

    // Headline, wrapped by hand — canvas has no text wrapping.
    ctx.fillStyle = "#F8FAFC";
    ctx.font = "800 82px Inter, system-ui, sans-serif";
    const words = headline.split(" ");
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > W - 160 && line) { lines.push(line); line = w; }
      else line = test;
    }
    if (line) lines.push(line);

    let y = H / 2 - (lines.length - 1) * 50;
    for (const l of lines) { ctx.fillText(l, 80, y); y += 100; }

    if (subline) {
      ctx.font = "400 40px Inter, system-ui, sans-serif";
      ctx.fillStyle = "#94A3B8";
      ctx.fillText(subline, 80, y + 30);
    }

    ctx.font = "500 34px Inter, system-ui, sans-serif";
    ctx.fillStyle = "#64748B";
    ctx.fillText(url.replace(/^https?:\/\//, ""), 80, H - 90);

    return canvas;
  }, [headline, subline, url]);

  const download = useCallback(() => {
    const canvas = draw();
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) { toast.error("Could not create the image."); return; }
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = "studybuddy-result.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoke on the next tick so the click has consumed the URL first.
      setTimeout(() => URL.revokeObjectURL(href), 0);
    }, "image/png");
  }, [draw]);

  const shareToWhatsApp = useCallback(() => {
    const text = `${headline}${subline ? ` — ${subline}` : ""}\n\n${url}`;
    window.open(
      `https://wa.me/?text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener,noreferrer"
    );
  }, [headline, subline, url]);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — long-press the link instead.");
    }
  }, [url]);

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div>
        <h3 className="text-sm font-bold text-foreground">Share your result</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          WhatsApp shares the text and link; download the image to attach it.
        </p>
      </div>

      {/* Preview at display size; the export stays 1080×1080. */}
      <canvas
        ref={(el) => { canvasRef.current = el; if (el) draw(); }}
        className="w-full max-w-[320px] mx-auto rounded-xl border border-border block"
        aria-label={`Share card: ${headline}`}
      />

      <div className="flex flex-wrap gap-2">
        <Button onClick={shareToWhatsApp} className="gap-2 h-10 bg-[#25D366] hover:bg-[#25D366]/90 text-white">
          <Share2 className="h-4 w-4" /> WhatsApp
        </Button>
        <Button onClick={download} variant="outline" className="gap-2 h-10">
          <Download className="h-4 w-4" /> Image
        </Button>
        <Button onClick={copyLink} variant="outline" className="gap-2 h-10">
          {copied ? <Check className="h-4 w-4 text-success" /> : null}
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
    </div>
  );
};

export default ShareCard;
