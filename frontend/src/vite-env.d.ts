/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL: string;
    readonly VITE_SUPABASE_ANON_KEY: string;
    /** Optional: public VAPID key for web push (defaults to the key built into pushNotifications.ts) */
    readonly VITE_VAPID_PUBLIC_KEY?: string;
}

/** docxtemplater ships this module without type declarations. */
declare module 'docxtemplater/js/modules/fix-doc-pr-corruption.js' {
    const fixDocPrCorruption: object;
    export default fixDocPrCorruption;
}
