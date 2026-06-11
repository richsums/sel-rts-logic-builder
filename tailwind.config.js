/** @type {import('tailwindcss').Config} */
export default {
  content: {
    // relative: true -> globs resolve against THIS file, not process.cwd(),
    // so utility generation is identical regardless of launch directory.
    relative: true,
    files: [
      "./index.html",
      "./src/**/*.{js,ts,jsx,tsx}",
    ],
  },
  theme: {
    extend: {
      colors: {
        sel: {
          blue: '#1a3a5c',
          accent: '#e8b84b',
          gray: '#4a5568',
        }
      }
    },
  },
  plugins: [],
}
