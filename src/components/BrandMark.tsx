import { cn } from "@/lib/utils";

/**
 * BRAND WORDMARK
 * ==============
 * The single source of truth for how "StudyBuddy AI" is rendered.
 *
 * This replaces the previous PNG logo files. Text has real advantages here:
 * it stays crisp at every density, scales with the layout, inherits theme
 * colours, and is readable to screen readers and search engines. It also means
 * the brand can be changed in one file rather than by re-exporting artwork.
 *
 * If a designed logo arrives later, swap the markup inside this component and
 * every navbar, footer, and auth screen picks it up automatically.
 */

const SIZES = {
  sm: "text-lg",
  md: "text-xl md:text-2xl",
  lg: "text-2xl md:text-3xl",
  xl: "text-3xl md:text-4xl",
} as const;

interface BrandMarkProps {
  /** Visual scale. Defaults to "md". */
  size?: keyof typeof SIZES;
  /**
   * Use on dark backgrounds (landing hero, footer, sidebar, auth panel).
   * Light mode inherits the current text colour instead.
   */
  onDark?: boolean;
  className?: string;
}

const BrandMark = ({ size = "md", onDark = false, className }: BrandMarkProps) => (
  <span
    className={cn(
      "font-display font-extrabold tracking-tight whitespace-nowrap select-none",
      SIZES[size],
      onDark ? "text-white" : "text-foreground",
      className
    )}
  >
    {/* A real space, not a CSS margin — margins are invisible to screen
        readers and to copy-paste, which would render this "StudyBuddyAI". */}
    StudyBuddy{" "}
    {/* The accent carries the brand colour and keeps "AI" visually distinct. */}
    <span className={onDark ? "text-cta" : "text-primary"}>AI</span>
  </span>
);

export default BrandMark;
