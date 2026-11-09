import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      /* ── StudyBuddy AI Typography ────────────────────────────────────
         Primary UI: Inter  |  Display/Hero: Sora  |  Reading: IBM Plex Serif
      ────────────────────────────────────────────────────────── */
      fontFamily: {
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
        display: ['"Sora"', '"Inter"', 'sans-serif'],
        serif: ['"IBM Plex Serif"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },

      /* ── StudyBuddy AI Color System ──────────────────────────────────
         Background → #F3F4F6  Surface → #FFFFFF
         Primary (Indigo) → #4F46E5  CTA (Deep Cyan) → #0E7490
         Success (Green) → #10B981  Error (Red) → #EF4444
      ────────────────────────────────────────────────────────── */
      colors: {
        /* Colour-family tints read theme variables so they adapt in dark mode */
        red: {
          50: "rgb(var(--red-50) / <alpha-value>)",
          100: "rgb(var(--red-100) / <alpha-value>)",
          200: "rgb(var(--red-200) / <alpha-value>)",
          600: "rgb(var(--red-600) / <alpha-value>)",
          700: "rgb(var(--red-700) / <alpha-value>)",
          800: "rgb(var(--red-800) / <alpha-value>)",
        },
        orange: {
          50: "rgb(var(--orange-50) / <alpha-value>)",
          100: "rgb(var(--orange-100) / <alpha-value>)",
          200: "rgb(var(--orange-200) / <alpha-value>)",
          600: "rgb(var(--orange-600) / <alpha-value>)",
          700: "rgb(var(--orange-700) / <alpha-value>)",
          800: "rgb(var(--orange-800) / <alpha-value>)",
        },
        amber: {
          50: "rgb(var(--amber-50) / <alpha-value>)",
          100: "rgb(var(--amber-100) / <alpha-value>)",
          200: "rgb(var(--amber-200) / <alpha-value>)",
          600: "rgb(var(--amber-600) / <alpha-value>)",
          700: "rgb(var(--amber-700) / <alpha-value>)",
          800: "rgb(var(--amber-800) / <alpha-value>)",
        },
        yellow: {
          50: "rgb(var(--yellow-50) / <alpha-value>)",
          100: "rgb(var(--yellow-100) / <alpha-value>)",
          200: "rgb(var(--yellow-200) / <alpha-value>)",
          600: "rgb(var(--yellow-600) / <alpha-value>)",
          700: "rgb(var(--yellow-700) / <alpha-value>)",
          800: "rgb(var(--yellow-800) / <alpha-value>)",
        },
        lime: {
          50: "rgb(var(--lime-50) / <alpha-value>)",
          100: "rgb(var(--lime-100) / <alpha-value>)",
          200: "rgb(var(--lime-200) / <alpha-value>)",
          600: "rgb(var(--lime-600) / <alpha-value>)",
          700: "rgb(var(--lime-700) / <alpha-value>)",
          800: "rgb(var(--lime-800) / <alpha-value>)",
        },
        green: {
          50: "rgb(var(--green-50) / <alpha-value>)",
          100: "rgb(var(--green-100) / <alpha-value>)",
          200: "rgb(var(--green-200) / <alpha-value>)",
          600: "rgb(var(--green-600) / <alpha-value>)",
          700: "rgb(var(--green-700) / <alpha-value>)",
          800: "rgb(var(--green-800) / <alpha-value>)",
        },
        emerald: {
          50: "rgb(var(--emerald-50) / <alpha-value>)",
          100: "rgb(var(--emerald-100) / <alpha-value>)",
          200: "rgb(var(--emerald-200) / <alpha-value>)",
          600: "rgb(var(--emerald-600) / <alpha-value>)",
          700: "rgb(var(--emerald-700) / <alpha-value>)",
          800: "rgb(var(--emerald-800) / <alpha-value>)",
        },
        teal: {
          50: "rgb(var(--teal-50) / <alpha-value>)",
          100: "rgb(var(--teal-100) / <alpha-value>)",
          200: "rgb(var(--teal-200) / <alpha-value>)",
          600: "rgb(var(--teal-600) / <alpha-value>)",
          700: "rgb(var(--teal-700) / <alpha-value>)",
          800: "rgb(var(--teal-800) / <alpha-value>)",
        },
        cyan: {
          50: "rgb(var(--cyan-50) / <alpha-value>)",
          100: "rgb(var(--cyan-100) / <alpha-value>)",
          200: "rgb(var(--cyan-200) / <alpha-value>)",
          600: "rgb(var(--cyan-600) / <alpha-value>)",
          700: "rgb(var(--cyan-700) / <alpha-value>)",
          800: "rgb(var(--cyan-800) / <alpha-value>)",
        },
        sky: {
          50: "rgb(var(--sky-50) / <alpha-value>)",
          100: "rgb(var(--sky-100) / <alpha-value>)",
          200: "rgb(var(--sky-200) / <alpha-value>)",
          600: "rgb(var(--sky-600) / <alpha-value>)",
          700: "rgb(var(--sky-700) / <alpha-value>)",
          800: "rgb(var(--sky-800) / <alpha-value>)",
        },
        blue: {
          50: "rgb(var(--blue-50) / <alpha-value>)",
          100: "rgb(var(--blue-100) / <alpha-value>)",
          200: "rgb(var(--blue-200) / <alpha-value>)",
          600: "rgb(var(--blue-600) / <alpha-value>)",
          700: "rgb(var(--blue-700) / <alpha-value>)",
          800: "rgb(var(--blue-800) / <alpha-value>)",
        },
        indigo: {
          50: "rgb(var(--indigo-50) / <alpha-value>)",
          100: "rgb(var(--indigo-100) / <alpha-value>)",
          200: "rgb(var(--indigo-200) / <alpha-value>)",
          600: "rgb(var(--indigo-600) / <alpha-value>)",
          700: "rgb(var(--indigo-700) / <alpha-value>)",
          800: "rgb(var(--indigo-800) / <alpha-value>)",
        },
        violet: {
          50: "rgb(var(--violet-50) / <alpha-value>)",
          100: "rgb(var(--violet-100) / <alpha-value>)",
          200: "rgb(var(--violet-200) / <alpha-value>)",
          600: "rgb(var(--violet-600) / <alpha-value>)",
          700: "rgb(var(--violet-700) / <alpha-value>)",
          800: "rgb(var(--violet-800) / <alpha-value>)",
        },
        purple: {
          50: "rgb(var(--purple-50) / <alpha-value>)",
          100: "rgb(var(--purple-100) / <alpha-value>)",
          200: "rgb(var(--purple-200) / <alpha-value>)",
          600: "rgb(var(--purple-600) / <alpha-value>)",
          700: "rgb(var(--purple-700) / <alpha-value>)",
          800: "rgb(var(--purple-800) / <alpha-value>)",
        },
        fuchsia: {
          50: "rgb(var(--fuchsia-50) / <alpha-value>)",
          100: "rgb(var(--fuchsia-100) / <alpha-value>)",
          200: "rgb(var(--fuchsia-200) / <alpha-value>)",
          600: "rgb(var(--fuchsia-600) / <alpha-value>)",
          700: "rgb(var(--fuchsia-700) / <alpha-value>)",
          800: "rgb(var(--fuchsia-800) / <alpha-value>)",
        },
        pink: {
          50: "rgb(var(--pink-50) / <alpha-value>)",
          100: "rgb(var(--pink-100) / <alpha-value>)",
          200: "rgb(var(--pink-200) / <alpha-value>)",
          600: "rgb(var(--pink-600) / <alpha-value>)",
          700: "rgb(var(--pink-700) / <alpha-value>)",
          800: "rgb(var(--pink-800) / <alpha-value>)",
        },
        rose: {
          50: "rgb(var(--rose-50) / <alpha-value>)",
          100: "rgb(var(--rose-100) / <alpha-value>)",
          200: "rgb(var(--rose-200) / <alpha-value>)",
          600: "rgb(var(--rose-600) / <alpha-value>)",
          700: "rgb(var(--rose-700) / <alpha-value>)",
          800: "rgb(var(--rose-800) / <alpha-value>)",
        },
        /* Neutral scales read theme variables so they flip in dark mode */
        gray: {
          50: "hsl(var(--gray-50) / <alpha-value>)",
          100: "hsl(var(--gray-100) / <alpha-value>)",
          200: "hsl(var(--gray-200) / <alpha-value>)",
          300: "hsl(var(--gray-300) / <alpha-value>)",
          400: "hsl(var(--gray-400) / <alpha-value>)",
          500: "hsl(var(--gray-500) / <alpha-value>)",
          600: "hsl(var(--gray-600) / <alpha-value>)",
          700: "hsl(var(--gray-700) / <alpha-value>)",
          800: "hsl(var(--gray-800) / <alpha-value>)",
          900: "hsl(var(--gray-900) / <alpha-value>)",
        },
        slate: {
          50: "hsl(var(--gray-50) / <alpha-value>)",
          100: "hsl(var(--gray-100) / <alpha-value>)",
          200: "hsl(var(--gray-200) / <alpha-value>)",
          300: "hsl(var(--gray-300) / <alpha-value>)",
          400: "hsl(var(--gray-400) / <alpha-value>)",
          500: "hsl(var(--gray-500) / <alpha-value>)",
          600: "hsl(var(--gray-600) / <alpha-value>)",
          700: "hsl(var(--gray-700) / <alpha-value>)",
          800: "hsl(var(--gray-800) / <alpha-value>)",
          900: "hsl(var(--gray-900) / <alpha-value>)",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          light: "hsl(var(--primary-light))",
          text: "hsl(var(--primary-text) / <alpha-value>)",
        },
        /* Amber CTA — use ONLY for main action buttons (max 1-2 per screen) */
        cta: {
          DEFAULT: "hsl(var(--cta))",
          foreground: "hsl(var(--cta-foreground))",
          light: "hsl(var(--cta-light))",
          text: "hsl(var(--cta-text) / <alpha-value>)",
        },
        /* Focus Green — correct answers, progress, completion */
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
          light: "hsl(var(--success-light))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        /* Legacy aliases for backward compatibility */
        deep: {
          DEFAULT: "hsl(var(--deep))",
          foreground: "hsl(var(--deep-foreground))",
        },
        navy: "hsl(var(--navy))",
        interface: "hsl(var(--interface))",
        soft: "hsl(var(--soft))",
        highlight: "hsl(var(--highlight))",
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },

      /* ── 8px Spacing Grid ──────────────────────────────────── */
      spacing: {
        "4.5": "1.125rem",
        "13": "3.25rem",
        "15": "3.75rem",
        "18": "4.5rem",
      },

      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },

      /* ── Typography Scale ──────────────────────────────────── */
      fontSize: {
        "micro": ["0.75rem", { lineHeight: "1rem", letterSpacing: "0.01em" }],
        "body-sm": ["0.875rem", { lineHeight: "1.25rem" }],
        "body": ["1rem", { lineHeight: "1.5rem" }],
        "heading-3": ["1.125rem", { lineHeight: "1.5rem", letterSpacing: "-0.01em" }],
        "heading-2": ["1.5rem", { lineHeight: "2rem", letterSpacing: "-0.02em" }],
        "heading-1": ["2rem", { lineHeight: "2.5rem", letterSpacing: "-0.02em" }],
        "display": ["3rem", { lineHeight: "1.1", letterSpacing: "-0.03em" }],
      },

      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "xp-pop": {
          "0%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.15)" },
          "100%": { transform: "scale(1)" },
        },
        "slide-in-right": {
          "0%": { transform: "translateX(100%)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-up": "fade-up 0.6s ease-out forwards",
        "fade-in": "fade-in 0.5s ease-out forwards",
        "xp-pop": "xp-pop 0.3s ease-in-out",
        "slide-in-right": "slide-in-right 0.3s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
