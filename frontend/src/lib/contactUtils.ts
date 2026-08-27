/**
 * Utility functions for contact management:
 * - Phone formatting for WhatsApp and direct call
 * - Google Maps URL generation for Address and Eircode
 * - Student contact summary formatting
 */

/**
 * Normalizes a phone number and generates a direct WhatsApp URL (https://wa.me/...).
 * Correctly handles Irish (+353, 08x), Ukrainian (+380, 0xx), UK (+44, 07x), and international numbers.
 */
export function formatPhoneForWhatsApp(phone: string | null | undefined): string | null {
    if (!phone) return null;
    let clean = phone.trim().replace(/[^\d+]/g, '');
    if (!clean) return null;

    if (clean.startsWith('00')) {
        clean = clean.substring(2);
    } else if (clean.startsWith('+')) {
        clean = clean.substring(1);
    } else if (clean.startsWith('08') && clean.length === 10) {
        // Irish mobile e.g. 087 123 4567 -> 353871234567
        clean = '353' + clean.substring(1);
    } else if (clean.startsWith('07') && clean.length === 11) {
        // UK mobile e.g. 07123 456789 -> 447123456789
        clean = '44' + clean.substring(1);
    } else {
        // Ukrainian mobile codes
        const uaCodes = ['050', '066', '095', '099', '067', '068', '096', '097', '098', '063', '073', '093', '091', '092', '094'];
        let isUa = false;
        for (const code of uaCodes) {
            if (clean.startsWith(code) && clean.length === 10) {
                clean = '38' + clean;
                isUa = true;
                break;
            }
        }
        if (!isUa && clean.startsWith('0') && clean.length >= 9) {
            // Default leading zero in Ireland
            clean = '353' + clean.substring(1);
        }
    }

    return clean ? `https://wa.me/${clean}` : null;
}

/**
 * Normalizes a phone number for direct tel: links.
 */
export function formatPhoneForCall(phone: string | null | undefined): string | null {
    if (!phone) return null;
    const clean = phone.trim().replace(/[\s-]/g, '');
    return clean ? `tel:${clean}` : null;
}

/**
 * Generates a Google Maps URL for an address or Eircode.
 */
export function formatGoogleMapsUrl(query: string | null | undefined): string | null {
    if (!query || !query.trim()) return null;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query.trim())}`;
}

/**
 * Formats a clean student contact summary block ready for clipboard copying.
 */
export function formatStudentContactSummary(student: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    eircode?: string | null;
    dob?: string | null;
}): string {
    const fullName = `${student.first_name || ''} ${student.last_name || ''}`.trim();
    const lines = [
        fullName || 'Student',
        student.email ? `Email: ${student.email}` : null,
        student.phone ? `Phone: ${student.phone}` : null,
        student.address ? `Address: ${student.address}` : null,
        student.eircode ? `Eircode: ${student.eircode}` : null,
        student.dob ? `Date of Birth: ${new Date(student.dob).toLocaleDateString('en-IE')}` : null,
    ].filter(Boolean);

    return lines.join('\n');
}
