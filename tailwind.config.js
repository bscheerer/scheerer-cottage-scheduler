/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Color tokens lifted directly from the design plan (section 7).
      // Inspired by Lake Michigan water + sunset + cottage photos.
      colors: {
        deep: "#1B4965",
        mid: "#2C7DA0",
        aqua: "#61A5C2",
        pale: "#A9D6E5",
        foam: "#E8F4F8",
        sand: { DEFAULT: "#F5E6CA", light: "#FAF3E3", deep: "#E2C892" },
        sunset: { amber: "#F7B267", coral: "#E76F51" },
        approved: "#2A9D8F",
        denied: "#B5654A",
        driftwood: "#5C3A21",
        offwhite: "#FBFAF6",
        ink: "#1F2A33",
        muted: "#6B7C85",
      },
      fontFamily: {
        display: ['Georgia', '"Iowan Old Style"', 'serif'],
        sans: [
          '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"',
          'Helvetica', 'Arial', 'sans-serif',
        ],
      },
      boxShadow: {
        soft: "0 4px 14px rgba(28,55,75,.10)",
        lift: "0 12px 40px rgba(28,55,75,.18)",
      },
    },
  },
  plugins: [],
};
