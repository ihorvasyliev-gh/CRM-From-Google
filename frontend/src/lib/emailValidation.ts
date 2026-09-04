/**
 * Email validation and typo suggestion utilities.
 * Detects common typos in popular email providers (e.g. gmali.com -> gmail.com)
 * to help users avoid failed confirmations or invitations.
 */

const COMMON_DOMAIN_TYPOS: Record<string, string> = {
    // Gmail
    'gmali.com': 'gmail.com',
    'gmai.com': 'gmail.com',
    'gamil.com': 'gmail.com',
    'gmal.com': 'gmail.com',
    'gmaill.com': 'gmail.com',
    'gmail.con': 'gmail.com',
    'gmail.co': 'gmail.com',
    'gmaik.com': 'gmail.com',
    'gemail.com': 'gmail.com',
    'gmaul.com': 'gmail.com',
    'gmaol.com': 'gmail.com',
    'gmeil.com': 'gmail.com',
    'gmail.cm': 'gmail.com',
    'gnail.com': 'gmail.com',
    'gmai.con': 'gmail.com',
    
    // Yahoo
    'yaho.com': 'yahoo.com',
    'yahooo.com': 'yahoo.com',
    'yahu.com': 'yahoo.com',
    'yaho.co.uk': 'yahoo.co.uk',
    'yahoo.con': 'yahoo.com',
    'yaho.ie': 'yahoo.ie',

    // Hotmail
    'hotmial.com': 'hotmail.com',
    'hotmai.com': 'hotmail.com',
    'hotmaill.com': 'hotmail.com',
    'hotmsil.com': 'hotmail.com',
    'hotamil.com': 'hotmail.com',
    'hotmail.con': 'hotmail.com',
    'hotmaik.com': 'hotmail.com',

    // Outlook
    'outlok.com': 'outlook.com',
    'oulook.com': 'outlook.com',
    'outloo.com': 'outlook.com',
    'outlock.com': 'outlook.com',
    'outlool.com': 'outlook.com',
    'outlook.con': 'outlook.com',

    // iCloud
    'icoud.com': 'icloud.com',
    'iclud.com': 'icloud.com',
    'iclaud.com': 'icloud.com',
    'icloud.con': 'icloud.com',
    'icloude.com': 'icloud.com',

    // Live
    'live.con': 'live.com',
    'liev.com': 'live.com',
};

/**
 * Returns a corrected email address if the domain contains a common typo,
 * or null if no obvious typo was detected.
 */
export function suggestEmailCorrection(email: string): string | null {
    if (!email || !email.includes('@')) return null;
    const parts = email.trim().split('@');
    if (parts.length !== 2) return null;
    const [user, domain] = parts;
    const cleanDomain = domain.toLowerCase().trim();
    const correctDomain = COMMON_DOMAIN_TYPOS[cleanDomain];
    if (correctDomain && correctDomain !== cleanDomain) {
        return `${user.toLowerCase().trim()}@${correctDomain}`;
    }
    return null;
}
