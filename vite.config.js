import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: '微店抢购助手',
        short_name: '抢购助手',
        description: '微店秒杀抢购工具',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'api-cache', expiration: { maxEntries: 50, maxAgeSeconds: 300 } }
          }
        ]
      }
    })
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api/thor': {
        target: 'https://thor.weidian.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/thor/, ''),
        secure: false,
        headers: {
          referer: 'https://servicewechat.com/'
        }
      },
      '/api/logtake': {
        target: 'https://logtake.weidian.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/logtake/, ''),
        secure: false
      }
    }
  }
})
