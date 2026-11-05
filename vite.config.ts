import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export const THEME_COLOR = '#ef6f5a'
export const BACKGROUND_COLOR = '#fff8f1'

export default defineConfig({
  root: 'src/web',
  build: { outDir: '../../dist/web', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:3100' },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: '.',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: {
        name: 'Ayunora',
        short_name: 'Ayunora',
        description: 'Tu reloj de ayuno intermitente',
        lang: 'es',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: THEME_COLOR,
        background_color: BACKGROUND_COLOR,
      },
      pwaAssets: {
        config: '../../pwa-assets.config.ts',
        overrideManifestIcons: true,
      },
      injectManifest: {
        // Sin `webmanifest`: el plugin ya añade el manifest al precache. Si también entra por el
        // glob, aparece dos veces con revisiones distintas y Workbox aborta la instalación del SW
        // (add-to-cache-list-conflicting-entries). Lo vigila scripts/check-sw.mjs.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
      },
      devOptions: { enabled: true, type: 'module' },
    }),
  ],
})
