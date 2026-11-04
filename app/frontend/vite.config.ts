import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // Pre-bundle these up front so a new import can't create a second copy of React mid-session.
  optimizeDeps: { include: ['react', 'react-dom', 'react-dom/client', 'react-router-dom', 'zustand', 'gsap', 'three', 'd3-geo', 'topojson-client', 'lucide-react', 'locomotive-scroll'] },
  plugins: [
    react(),
    tailwindcss()
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.FLOODSHIELD_API ?? 'http://127.0.0.1:8000',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://127.0.0.1:8000',
        ws: true
      }
    }
  }
})
