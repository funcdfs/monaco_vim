import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const isProd = mode === 'production'
  
  return {
    base: isProd ? '/' : '/',
    plugins: [react()],
    build: {
      outDir: 'dist',
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              return 'vendor'
            }
          }
        }
      },
      minify: isProd ? 'terser' : false,
      sourcemap: !isProd
    },
    server: {
      port: 5173,
      strictPort: true,
      open: true
    }
  }
})
