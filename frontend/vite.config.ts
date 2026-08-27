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
                    dnd: ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
                    editor: ['react-quill-new'],
                    'excel-export': ['exceljs', 'file-saver'],
                    'docx-gen': ['docxtemplater', 'pizzip', 'jszip']
                }
            }
        },
        chunkSizeWarningLimit: 1200
    }
}))
