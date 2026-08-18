import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
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
          400: "var(--color-neutral-400)",
          600: "var(--color-neutral-600)",
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
    },
  },
  plugins: [],
} satisfies Config;
