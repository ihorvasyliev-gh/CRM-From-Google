/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class',
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
                mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
            },
            colors: {
                background: 'oklch(var(--bg-background) / <alpha-value>)',
                surface: {
                    DEFAULT: 'oklch(var(--bg-surface) / <alpha-value>)',
                    elevated: 'oklch(var(--bg-surface-elevated) / <alpha-value>)',
                },
                primary: 'oklch(var(--text-primary) / <alpha-value>)',
                muted: 'oklch(var(--text-muted) / <alpha-value>)',
                border: {
                    subtle: 'oklch(var(--border-subtle) / <alpha-value>)',
                    strong: 'oklch(var(--border-strong) / <alpha-value>)',
                },
                brand: {
                    50: '#eef2ff',
                    100: '#e0e7ff',
                    200: '#c7d2fe',
                    300: '#a5b4fc',
                    400: '#818cf8',
                    500: 'oklch(var(--accent-primary) / <alpha-value>)',
                    600: 'oklch(var(--accent-primary-hover) / <alpha-value>)',
                    700: '#4338ca',
                    800: '#3730a3',
                    900: '#312e81',
                    950: '#1e1b4b',
                },
                /* Semantic Status Colors mapped for continuity */
                success: 'oklch(var(--status-success) / <alpha-value>)',
                warning: 'oklch(var(--status-warning) / <alpha-value>)',
                danger: 'oklch(var(--status-danger) / <alpha-value>)',
                info: 'oklch(var(--status-info) / <alpha-value>)',
            },
            boxShadow: {
                'glow-sm': '0 0 15px -3px rgba(99, 102, 241, 0.15)',
                'glow': '0 0 25px -5px rgba(99, 102, 241, 0.2)',
                'glow-lg': '0 0 40px -8px rgba(99, 102, 241, 0.25)',
                'card': '0 1px 3px 0 rgba(0, 0, 0, 0.04), 0 1px 2px -1px rgba(0, 0, 0, 0.04)',
                'card-hover': '0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.04)',
                'float': '0 20px 40px -12px rgba(0, 0, 0, 0.15)',
                'inner-glow': 'inset 0 1px 0 0 rgba(255, 255, 255, 0.05)',
            },
            animation: {
                'shimmer': 'shimmer 2s infinite linear',
                'float': 'float 6s ease-in-out infinite',
                'pulse-subtle': 'pulse-subtle 2s ease-in-out infinite',
                'gradient': 'gradient 8s ease infinite',
                'fadeIn': 'fadeIn 0.2s ease-out',
                'scaleIn': 'scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                'popoverScaleIn': 'popoverScaleIn 0.15s cubic-bezier(0.16, 1, 0.3, 1) both',
                'sheetSlideUp': 'sheetSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) both',
                'slideInRight': 'slideInRight 0.35s cubic-bezier(0.16, 1, 0.3, 1) both',
                'slideUp': 'slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) both',
                'slideUpCenter': 'slideUpCenter 0.35s cubic-bezier(0.16, 1, 0.3, 1) both',
                'slideDown': 'slideDown 0.25s ease-out',
                'glow': 'glow 2s ease-in-out infinite',
                'countUp': 'countUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) both',
            },
            keyframes: {
                shimmer: {
                    '0%': { transform: 'translateX(-100%)' },
                    '100%': { transform: 'translateX(100%)' },
                },
                float: {
                    '0%, 100%': { transform: 'translateY(0px)' },
                    '50%': { transform: 'translateY(-10px)' },
                },
                'pulse-subtle': {
                    '0%, 100%': { opacity: '1' },
                    '50%': { opacity: '0.7' },
                },
                gradient: {
                    '0%, 100%': { backgroundPosition: '0% 50%' },
                    '50%': { backgroundPosition: '100% 50%' },
                },
                fadeIn: {
                    from: { opacity: '0' },
                    to: { opacity: '1' },
                },
                scaleIn: {
                    from: { opacity: '0', transform: 'scale(0.95) translateY(10px)' },
                    to: { opacity: '1', transform: 'scale(1) translateY(0)' },
                },
                popoverScaleIn: {
                    from: { opacity: '0', transform: 'scale(0.92)' },
                    to: { opacity: '1', transform: 'scale(1)' },
                },
                sheetSlideUp: {
                    from: { opacity: '0', transform: 'translateY(100%)' },
                    to: { opacity: '1', transform: 'translateY(0)' },
                },
                slideInRight: {
                    from: { transform: 'translateX(100%)', opacity: '0' },
                    to: { transform: 'translateX(0)', opacity: '1' },
                },
                slideUp: {
                    from: { opacity: '0', transform: 'translateY(20px)' },
                    to: { opacity: '1', transform: 'translateY(0)' },
                },
                slideUpCenter: {
                    from: { opacity: '0', transform: 'translate(-50%, 20px)' },
                    to: { opacity: '1', transform: 'translate(-50%, 0)' },
                },
                slideDown: {
                    from: { opacity: '0', transform: 'translateY(-10px)' },
                    to: { opacity: '1', transform: 'translateY(0)' },
                },
                glow: {
                    '0%, 100%': { boxShadow: '0 0 20px rgba(99, 102, 241, 0.15)' },
                    '50%': { boxShadow: '0 0 30px rgba(99, 102, 241, 0.3)' },
                },
                countUp: {
                    from: { opacity: '0', transform: 'translateY(10px)' },
                    to: { opacity: '1', transform: 'translateY(0)' },
                },
            },
            transitionTimingFunction: {
                'spring': 'var(--ease-spring-out, cubic-bezier(0.34, 1.56, 0.64, 1))',
            },
        },
    },
    plugins: [],
}
