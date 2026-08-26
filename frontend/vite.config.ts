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
                    'admin-libs': ['recharts', '@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities', 'react-quill-new'],
                    'doc-utils': ['docxtemplater', 'pizzip', 'jszip', 'exceljs', 'file-saver']
                }
            }
        },
        chunkSizeWarningLimit: 1600
    }
}))
