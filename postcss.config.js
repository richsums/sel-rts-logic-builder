import { fileURLToPath } from 'node:url';

// Resolve the Tailwind config explicitly so builds behave identically no matter
// which working directory Vite is launched from (CI, IDE, preview harnesses).
export default {
  plugins: {
    tailwindcss: { config: fileURLToPath(new URL('./tailwind.config.js', import.meta.url)) },
    autoprefixer: {},
  },
};
