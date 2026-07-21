/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        panel: "#1e1f26",
        panelalt: "#26272f",
        edge: "#34353f",
        accent: "#5b8cff",
      },
    },
  },
  plugins: [],
};
