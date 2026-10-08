import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** Long-lived vendor chunks, so an app deploy does not invalidate cached libraries. */
const chunkGroups: Record<string, string[]> = {
    vendor: ['react', 'react-dom', 'scheduler', 'lucide-react', 'react-router', 'react-router-dom', '@tanstack/react-query'],
    charts: ['recharts'],
    dnd: ['@dnd-kit/core'],
    'excel-export': ['write-excel-file', 'fflate'],
    'docx-gen': ['docxtemplater'],
    // Shared by Word documents and the .xlsx reader
    zip: ['pizzip'],
}

/** Email template editor: TipTap and the ProseMirror packages under it. */
const editorChunk = /[\\/]node_modules[\\/](@tiptap[\\/][^\\/]+|prosemirror-[^\\/]+|linkifyjs|orderedmap|rope-sequence|w3c-keyname)[\\/]/

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// https://vite.dev/config/
export default defineConfig({
    plugins: [react(), tailwindcss()],
    // The document worker loads pizzip/docxtemplater with dynamic import(), which needs ES module workers
    worker: { format: 'es' },
    build: {
        rolldownOptions: {
            // Drop debug output in production but keep console.error / console.warn: for many
            // failures (caught errors, failed syncs) they are the only trace left
            treeshake: { manualPureFunctions: ['console.log', 'console.debug', 'console.info'] },
            output: {
                minify: {
                    compress: { dropDebugger: true },
                },
                codeSplitting: {
                    groups: [
                        ...Object.entries(chunkGroups).map(([name, pkgs]) => ({
                            name,
                            test: new RegExp(`[\\\\/]node_modules[\\\\/](${pkgs.map(escapeRegExp).join('|')})[\\\\/]`),
                        })),
                        { name: 'editor', test: editorChunk },
                    ],
                },
            },
        },
        chunkSizeWarningLimit: 1200,
    },
})
