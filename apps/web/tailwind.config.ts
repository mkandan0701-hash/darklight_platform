import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1B2430",
        board: {
          DEFAULT: "#1F6D4C",
          dark: "#17533A",
          light: "#E8F2EC",
        },
        gold: {
          DEFAULT: "#C9A227",
          light: "#F6ECC9",
          // Text-safe gold: 4.8:1 on white. GOLD itself is ~2.4:1 — fills only.
          dark: "#8A6D12",
        },
        parchment: "#F7F5EF",
        slate: {
          DEFAULT: "#5B6472",
          light: "#E4E2DA",
        },
        brick: {
          DEFAULT: "#B3402F",
          light: "#F5E3DF",
        },
      },
      fontFamily: {
        display: ["var(--font-display)"],
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        xl: "0.875rem",
      },
    },
  },
  plugins: [],
};

export default config;
