import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'case-insensitive-public-assets',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url) {
            const [path, query] = req.url.split('?');
            const cleanPath = path.toLowerCase();
            if (cleanPath === '/kaioken-logo.png' || cleanPath === '/assets/kaioken-logo.png') {
              req.url = '/kaioken-logo.png' + (query ? `?${query}` : '');
            } else if (cleanPath === '/kaio_pet.png' || cleanPath === '/assets/kaio_pet.png') {
              req.url = '/kaio_pet.png' + (query ? `?${query}` : '');
            }
          }
          next();
        });
      },
    },
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5180,
    host: true,
  },
});
