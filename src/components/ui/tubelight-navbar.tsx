import { useMemo } from "react"
import { motion } from "framer-motion"
import { Link, useLocation } from "react-router-dom"
import { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface NavItem {
  name: string
  url: string
  icon: LucideIcon
}

interface NavBarProps {
  items: NavItem[]
  /**
   * True over a dark surface (the landing hero), false over a light one.
   * The pill used to be dark-glass with white labels unconditionally, which
   * put white-on-light-grey text over the About page's background.
   */
  onDark?: boolean
  className?: string
}

export function NavBar({ items, onDark = true, className }: NavBarProps) {
  const location = useLocation()

  /**
   * Which item is highlighted comes from the URL, not from a click. The old
   * useState(items[0].name) meant that landing on /about directly — or
   * reloading it — highlighted "Home", because nothing had been clicked yet.
   */
  const activeName = useMemo(() => {
    const current = `${location.pathname}${location.hash}`
    // Exact first, so "/#features" wins over "/" while that hash is set.
    const exact = items.find((i) => i.url === current)
    if (exact) return exact.name
    const byPath = items.find((i) => i.url === location.pathname)
    // No match highlights nothing, rather than wrongly highlighting the first
    // item on a route this nav does not cover.
    return byPath?.name ?? null
  }, [items, location.pathname, location.hash])

  return (
    /*
     * "bottom-0 md:top-0" set BOTH offsets at md and up, and a fixed element
     * with top:0 and bottom:0 and no height stretches to the full viewport.
     * This wrapper was therefore a 337px-wide, full-height, invisible z-50
     * column down the centre of every page carrying it — and with
     * pointer-events:auto it swallowed every click inside that column. The
     * landing page's "Get Started For Free" button sat right under it and
     * could not be clicked at all on desktop.
     *
     * md:bottom-auto releases the second offset so the bar is only as tall as
     * the pill. pointer-events-none on the wrapper with pointer-events-auto on
     * the pill is the belt-and-braces half: whatever the wrapper's box ends up
     * being, only the pill itself can ever take a click.
     */
    <div
      className={cn(
        "fixed bottom-0 md:bottom-auto md:top-0 left-1/2 -translate-x-1/2 z-50 mb-6 md:pt-6 pointer-events-none",
        className,
      )}
    >
      <div
        className={cn(
          "pointer-events-auto flex items-center gap-3 backdrop-blur-lg py-1 px-1 rounded-full shadow-lg border",
          onDark
            ? "bg-black/25 border-white/20"
            : "bg-card/85 border-border",
        )}
      >
        {items.map((item) => {
          const Icon = item.icon
          const isActive = activeName === item.name

          return (
            <Link
              key={item.name}
              to={item.url}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative cursor-pointer text-sm font-semibold px-6 py-2 rounded-full transition-colors",
                onDark
                  ? "text-white/70 hover:text-white"
                  : "text-muted-foreground hover:text-foreground",
                isActive && (onDark
                  ? "bg-white/15 text-white"
                  : "bg-secondary text-foreground"),
              )}
            >
              <span className="hidden md:inline">{item.name}</span>
              <span className="md:hidden">
                <Icon size={18} strokeWidth={2.5} />
              </span>
              {isActive && (
                <motion.div
                  layoutId="lamp"
                  className="absolute inset-0 w-full bg-primary/10 rounded-full -z-10"
                  initial={false}
                  transition={{
                    type: "spring",
                    stiffness: 300,
                    damping: 30,
                  }}
                >
                  {/* The top bar and glow effect was removed per request */}
                </motion.div>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
