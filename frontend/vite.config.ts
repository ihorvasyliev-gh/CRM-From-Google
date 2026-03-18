import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
    plugins: [react()],
    esbuild: {
        drop: command === 'build' ? ['console', 'debugger'] : [],
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    vendor: ['react', 'react-dom', 'lucide-react', 'react-router-dom'],
                    'doc-utils': ['docxtemplater', 'pizzip', 'jszip', 'exceljs', 'file-saver']
                }
            }
        },
        chunkSizeWarningLimit: 1600
    }
}))
