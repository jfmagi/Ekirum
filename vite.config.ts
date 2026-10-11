import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Plugin that allows root index.html to be the production bundle (for static hosts like GitHub Pages branch deploy)
// while dynamically resolving /src/main.tsx during development and build compilation.
function devHtmlPlugin() {
  return {
    name: 'html-entry-resolver',
    transformIndexHtml: {
      order: 'pre' as const,
      handler(html: string) {
        const cleaned = html
          .replace(/<script type="module" crossorigin src="\/assets\/[^"]+"><\/script>/g, '')
          .replace(/<link rel="modulepreload"[^>]+>/g, '')
          .replace(/<link rel="stylesheet" crossorigin href="\/assets\/[^"]+">/g, '');

        if (!cleaned.includes('/src/main.tsx')) {
          return cleaned.replace('</body>', '    <script type="module" src="/src/main.tsx"></script>\n  </body>');
        }
        return cleaned;
      },
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    devHtmlPlugin(),
    tailwindcss(),
    react(),
  ],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/framer-motion')) {
            return 'vendor-framer';
          }
          if (id.includes('node_modules/dexie')) {
            return 'vendor-db';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-icons';
          }
        },
      },
    },
  },
});
