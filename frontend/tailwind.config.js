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
                background: 'rgb(var(--bg-background) / <alpha-value>)',
                surface: {
                    DEFAULT: 'rgb(var(--bg-surface) / <alpha-value>)',
                    elevated: 'rgb(var(--bg-surface-elevated) / <alpha-value>)',
                },
                primary: 'rgb(var(--text-primary) / <alpha-value>)',
                muted: 'rgb(var(--text-muted) / <alpha-value>)',
                border: {
                    subtle: 'rgb(var(--border-subtle) / <alpha-value>)',
                    strong: 'rgb(var(--border-strong) / <alpha-value>)',
                },
                brand: {
                    50: '#eef2ff',
                    100: '#e0e7ff',
                    200: '#c7d2fe',
                    300: '#a5b4fc',
                    400: '#818cf8',
                    500: 'rgb(var(--accent-primary) / <alpha-value>)',
                    600: 'rgb(var(--accent-primary-hover) / <alpha-value>)',
                    700: '#4338ca',
                    800: '#3730a3',
                    900: '#312e81',
                    950: '#1e1b4b',
                },
                /* Semantic Status Colors mapped for continuity */
                success: 'rgb(var(--status-success) / <alpha-value>)',
                warning: 'rgb(var(--status-warning) / <alpha-value>)',
                danger: 'rgb(var(--status-danger) / <alpha-value>)',
                info: 'rgb(var(--status-info) / <alpha-value>)',
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
            },
        },
    },
    plugins: [],
}
