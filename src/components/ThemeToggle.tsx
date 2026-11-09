import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  /** Use on always-dark surfaces (landing hero, app sidebar). */
  onDark?: boolean;
  /** Show a text label next to the icon (sidebar row). */
  label?: boolean;
  className?: string;
}

/**
 * Light/dark switch. The icon is chosen with CSS (`dark:` variants), so the
 * first paint is always right and there is no flash of the wrong icon.
 * The preference is stored by next-themes under the "theme" key and applied
 * before first paint by the inline script in index.html.
 */
const ThemeToggle = ({ onDark = false, label = false, className }: ThemeToggleProps) => {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label="Toggle light and dark theme"
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-3 rounded-xl transition-colors duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        label ? "w-full px-4 py-3 text-sm justify-start" : "h-10 w-10",
        onDark
          ? "text-white/60 hover:bg-white/[0.08] hover:text-white"
          : "border border-border bg-card text-foreground hover:bg-muted",
        className,
      )}
    >
      <Sun className="hidden h-4 w-4 dark:block" aria-hidden />
      <Moon className="h-4 w-4 dark:hidden" aria-hidden />
      {label && (
        <span>
          <span className="dark:hidden">Dark mode</span>
          <span className="hidden dark:inline">Light mode</span>
        </span>
      )}
    </button>
  );
};

export default ThemeToggle;
