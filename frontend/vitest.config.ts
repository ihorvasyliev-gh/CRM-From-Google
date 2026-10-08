import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

/** Tests that build their workbooks with exceljs: it require()s uuid, which is ESM since v14,
 *  and a VM context can't require ESM, so these run in the default worker pool */
const EXCELJS_FIXTURES = ['src/lib/contactImport.test.ts', 'src/lib/pdfForms/excel.test.ts']

export default defineConfig({
    plugins: [react()],
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: './vitest-setup.ts',
        testTimeout: 15000,
        projects: [
            {
                extends: true,
                // A fresh VM context per file instead of a new worker with its own jsdom: about 3× faster
                test: { name: 'app', pool: 'vmThreads', exclude: [...configDefaults.exclude, ...EXCELJS_FIXTURES] },
            },
            { extends: true, test: { name: 'exceljs-fixtures', include: EXCELJS_FIXTURES } },
        ],
    },
})
