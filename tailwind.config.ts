import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Profit Path Sports brand tokens — mirror lib/globals.css CSS vars.
        bg: "var(--bg)",
        panel: "var(--panel)",
        surface2: "var(--surface-2)",
        surface3: "var(--surface-3)",
        ppborder: "var(--border)",
        ppborder2: "var(--border-2)",
        pptext: "var(--text)",
        muted: "var(--muted)",
        dim: "var(--dim)",
        ppgreen: "var(--green)",
        "ppgreen-dim": "var(--green-dim)",
        "ppgreen-faint": "var(--green-faint)",
        ppcyan: "var(--cyan)",
        "ppcyan-dim": "var(--cyan-dim)",
        ppyellow: "var(--yellow)",
        ppred: "var(--red)",
        "ppred-dim": "var(--red-dim)",
      },
      fontFamily: {
        brand: ["var(--font-jakarta)", "system-ui", "sans-serif"],
        mono: ["var(--font-dmmono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
