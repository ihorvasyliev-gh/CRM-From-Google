import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** Long-lived vendor chunks, so an app deploy does not invalidate cached libraries. */
const chunkGroups: Record<string, string[]> = {
    vendor: ['react', 'react-dom', 'scheduler', 'lucide-react', 'react-router', 'react-router-dom', '@tanstack/react-query'],
    charts: ['recharts'],
    dnd: ['@dnd-kit/core'],
    editor: ['react-quill-new', 'quill'],
    'excel-export': ['exceljs'],
    'docx-gen': ['docxtemplater', 'pizzip'],
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// https://vite.dev/config/
export default defineConfig({
    plugins: [react(), tailwindcss()],
    build: {
        rolldownOptions: {
            output: {
                minify: {
                    compress: { dropConsole: true, dropDebugger: true },
                },
                codeSplitting: {
                    groups: Object.entries(chunkGroups).map(([name, pkgs]) => ({
                        name,
                        test: new RegExp(`[\\\\/]node_modules[\\\\/](${pkgs.map(escapeRegExp).join('|')})[\\\\/]`),
                    })),
                },
            },
        },
        chunkSizeWarningLimit: 1200,
    },
})
