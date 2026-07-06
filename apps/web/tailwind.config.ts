import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#06111f",
        panel: "#0a1930",
        raised: "#101728",
        gold: "#ff2fae",
        aqua: "#20f0ff",
        sky: "#75f6ff",
        palm: "#22c55e",
        muted: "#a8bed0"
      },
      boxShadow: {
        gold: "0 0 0 1px rgba(255, 47, 174, 0.32), 0 18px 60px rgba(0, 217, 255, 0.16), 0 24px 80px rgba(0, 0, 0, 0.45)"
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
} satisfies Config;
