// ─── Where a course takes place, as a link ─────────────────────

const URL_RE = /\bhttps?:\/\/[^\s<>"']+/i;
/** Online courses have nothing to find on a map */
const ONLINE = /\b(online|zoom|ms teams|microsoft teams|google meet|webinar|virtual)\b/i;
/** The place already says where it is: Cork, Ireland, a county, or an Eircode */
const LOCATED = /\b(cork|ireland|eire|co\.?\s+[a-z]+)\b|\b([ac-fhknprtv-y]\d{2}|d6w)\s?[0-9ac-fhknprtv-y]{4}\b/i;

/**
 * Link for a course's place: the place's own link when it holds one, otherwise a Google Maps
 * search for it (in Cork, unless it says where it is). Online places get no link.
 */
export function placeHref(place: string | null | undefined): string | null {
    const text = place?.replace(/\s+/g, ' ').trim();
    if (!text) return null;
    const url = text.match(URL_RE);
    if (url) return url[0].replace(/[.,;:)]+$/, '');
    if (ONLINE.test(text)) return null;
    const query = LOCATED.test(text) ? text : `${text}, Cork, Ireland`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
