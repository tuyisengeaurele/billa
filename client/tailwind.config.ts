import type { Config } from "tailwindcss";

export default {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "var(--color-surface)",
          hover: "var(--color-surface-hover)",
        },
        page: "var(--color-page)",
        primary: {
          100: "var(--color-primary-100)",
          500: "var(--color-primary-500)",
          700: "var(--color-primary-700)",
          DEFAULT: "var(--color-primary-500)",
        },
        secondary: {
          DEFAULT: "var(--color-secondary)",
          deep: "var(--color-secondary-deep)",
        },
        neutral: {
          50: "var(--color-neutral-50)",
          100: "var(--color-neutral-100)",
          200: "var(--color-neutral-200)",
          300: "var(--color-neutral-300)",
          400: "var(--color-neutral-400)",
          500: "var(--color-neutral-500)",
          600: "var(--color-neutral-600)",
          700: "var(--color-neutral-700)",
          800: "var(--color-neutral-800)",
          900: "var(--color-neutral-900)",
        },
        success: {
          bg: "var(--color-success-bg)",
          DEFAULT: "var(--color-success)",
        },
        error: {
          bg: "var(--color-error-bg)",
          DEFAULT: "var(--color-error)",
        },
        warning: {
          bg: "var(--color-warning-bg)",
          DEFAULT: "var(--color-warning)",
        },
      },
      fontFamily: {
        display: ["Fraunces Variable", "ui-serif", "serif"],
        sans: ["Plus Jakarta Sans Variable", "ui-sans-serif", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
