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
                    vendor: ['react', 'react-dom', 'lucide-react', 'react-router-dom', '@tanstack/react-query'],
                    charts: ['recharts'],
                    dnd: ['@dnd-kit/core'],
                    editor: ['react-quill-new'],
                    'excel-export': ['exceljs'],
                    'docx-gen': ['docxtemplater', 'pizzip']
                }
            }
        },
        chunkSizeWarningLimit: 1200
    }
}))
