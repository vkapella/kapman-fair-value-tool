/** @type {import('tailwindcss').Config} */
// Alias layer over the vendored KapMan theme (src/design/kapman-ui.css).
// Mirrors kapman-tradelog/tailwind.config.ts so class names read identically
// across the three apps: bg-surface-2, text-text-3, border-border, etc.
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        "surface-3": "var(--surface-3)",
        border: "var(--border)",
        "border-subtle": "var(--border-subtle)",
        "border-strong": "var(--border-strong)",
        text: "var(--text)",
        "text-2": "var(--text-2)",
        "text-3": "var(--text-3)",
        "text-4": "var(--text-4)",
        accent: "var(--accent)",
        "accent-dim": "var(--accent-dim)",
        "accent-border": "var(--accent-border)",
        "accent-soft": "var(--accent-soft)",
        gold: "var(--gold)",
        pos: "var(--pos)",
        "pos-dim": "var(--pos-dim)",
        "pos-border": "var(--pos-border)",
        warn: "var(--warn)",
        "warn-dim": "var(--warn-dim)",
        "warn-border": "var(--warn-border)",
        neg: "var(--neg)",
        "neg-dim": "var(--neg-dim)",
        "neg-border": "var(--neg-border)",
      },
      borderColor: {
        DEFAULT: "var(--border)",
        border: "var(--border)",
        "border-subtle": "var(--border-subtle)",
        "border-strong": "var(--border-strong)",
      },
      fontFamily: {
        sans: "var(--sans)",
        mono: "var(--mono)",
      },
      minWidth: {
        "chip-1": "var(--chip-w-1)",
        "chip-2": "var(--chip-w-2)",
        "chip-3": "var(--chip-w-3)",
      },
    },
  },
  plugins: [],
};
