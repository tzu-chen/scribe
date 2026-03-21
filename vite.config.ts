import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import flowchartManifest from './vite-plugin-flowchart-manifest'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), flowchartManifest()],
  server: {
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3003',
        changeOrigin: true,
      },
    },
  },
})
