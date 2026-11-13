import type { EnrollmentWithRelations } from '../../lib/documentUtils';
import { cleanVariant } from '../../lib/types';
import { formatDateDMY } from '../../lib/dateUtils';
import { levenshteinDistance } from '../../lib/similarity';

// ─── Location & Geographic Intelligence Types ─────────────────

export interface NormalizedLocation {
    microDistrict: string;
    macroRegion: string;
    isRecognized: boolean;
}

// ─── Cork Districts & Locations Knowledge Base ────────────────

interface DistrictDefinition {
    canonicalName: string;
    macroRegion: string;
    aliases: string[];
    eircodePrefixes?: string[];
}

const DISTRICT_DEFINITIONS: DistrictDefinition[] = [
    // ── 1. Cork City (North) ──
    {
        canonicalName: 'Blackpool',
        macroRegion: 'Cork City (North)',
        aliases: ['blackpool', 'blackpol', 'black pool', 'watercourse rd', 'watercourse road', 'commons rd', 'commons road', 'great william o brien st', 'brocklesby st']
    },
    {
        canonicalName: 'Mayfield',
        macroRegion: 'Cork City (North)',
        aliases: ['mayfield', 'mayfeild', 'may field', 'silversprings', 'silver springs', 'old youghal rd', 'old youghal road', 'boherboy rd', 'lotabeg', 'banduff', 'kerry pike', 'iona park']
    },
    {
        canonicalName: 'Ballyvolane',
        macroRegion: 'Cork City (North)',
        aliases: ['ballyvolane', 'ballyvolan', 'balyvolane', 'fox and hounds', 'fox & hounds', 'ballyhooly rd', 'ballyhooly road', 'dublin hill', 'spring lane']
    },
    {
        canonicalName: 'Gurranabraher',
        macroRegion: 'Cork City (North)',
        aliases: ['gurranabraher', 'gurranebraher', 'guranabraher', 'gurran', 'gurrane', 'st marys rd', 'bakers rd', 'bakers road', 'blarney st', 'blarney street']
    },
    {
        canonicalName: 'Shandon',
        macroRegion: 'Cork City (North)',
        aliases: ['shandon', 'shandon st', 'shandon street', 'cathedral rd', 'cathedral road', 'church st', 'dominick st', 'firkin crane', 'roman st']
    },
    {
        canonicalName: 'Knocknaheeny',
        macroRegion: 'Cork City (North)',
        aliases: ['knocknaheeny', 'knocknaheny', 'knocknaheene', 'knocnaheeny', 'harbour view rd', 'harbour view road', 'kilmore rd', 'faranree park']
    },
    {
        canonicalName: 'Churchfield',
        macroRegion: 'Cork City (North)',
        aliases: ['churchfield', 'church field', 'churchfield ave', 'churchfield green', 'churchfield square']
    },
    {
        canonicalName: 'Fairhill',
        macroRegion: 'Cork City (North)',
        aliases: ['fairhill', 'fair hill', 'fairhill drive', 'fairhill ave']
    },
    {
        canonicalName: 'Farranree',
        macroRegion: 'Cork City (North)',
        aliases: ['farranree', 'faranree', 'farranferris', 'popenloo', 'popes quay']
    },
    {
        canonicalName: 'Hollyhill',
        macroRegion: 'Cork City (North)',
        aliases: ['hollyhill', 'holly hill', 'kilcully', 'apple campus']
    },
    {
        canonicalName: 'Montenotte',
        macroRegion: 'Cork City (North)',
        aliases: ['montenotte', 'montenote', 'middle glanmire rd', 'lovers walk', 'tivoli', 'silversprings']
    },
    {
        canonicalName: "St. Luke's",
        macroRegion: 'Cork City (North)',
        aliases: ['st lukes', 'st. lukes', 'saint lukes', 'summerhill north', 'summerhill', 'wellington rd', 'wellington road', 'military hill', 'dillons cross']
    },
    {
        canonicalName: "Sunday's Well",
        macroRegion: 'Cork City (North)',
        aliases: ['sundays well', "sunday's well", 'shanakiel', 'buena vista', 'wellington square']
    },

    // ── 2. Cork City (South & Centre) ──
    {
        canonicalName: 'Cork City Centre',
        macroRegion: 'Cork City (Centre)',
        aliases: [
            'city centre', 'city center', 'cork city', 'grand parade', 'patrick st', 'patrick street', "st patrick's st",
            'oliver plunkett', 'oliver plunkett st', 'south mall', 'north main st', 'south main st', 'paul st',
            'washington st', 'washington street', 'maccurtain st', 'mccurtain st', 'cornmarket st', 'coal quay',
            'georges quay', 'sullivans quay', 'merchants quay', 'lavitts quay', 'custom house', 'penrose quay',
            'albert quay', 'union quay', 'parliament st', 'princes st', 'marlborough st', 'cook st', 'caroline st',
            'pembroke st', 'academy st', 'maylor st', 'bridge st', 'daunts sq', 'emmet place'
        ]
    },
    {
        canonicalName: 'Douglas',
        macroRegion: 'Cork City (South)',
        aliases: ['douglas', 'duglas', 'dougles', 'douglass', 'grange', 'donnybrook', 'maryborough', 'well road', 'douglas west', 'douglas east', 'douglas rd', 'douglas road', 'woolshed', 'broadale', 'frankfield']
    },
    {
        canonicalName: 'Togher',
        macroRegion: 'Cork City (South)',
        aliases: ['togher', 'toger', 'togher rd', 'togher road', 'clashduv', 'deanrock', 'tramore rd', 'tramore road', 'vicars rd', 'lehenaghmore', 'lehenaghbeg', 'pouladuff']
    },
    {
        canonicalName: 'Ballyphehane',
        macroRegion: 'Cork City (South)',
        aliases: ['ballyphehane', 'ballyfehane', 'bally phehane', 'ballyphehan', 'pearse sq', 'pearse square', 'tory top', 'tory top rd', 'connolly rd', 'lower friars walk', 'friars walk']
    },
    {
        canonicalName: "Turner's Cross",
        macroRegion: 'Cork City (South)',
        aliases: ['turners cross', "turner's cross", 'turnerscross', 'curragh rd', 'curragh road', 'kinsale rd', 'evergreen rd', 'south douglas rd', 'derrynane rd']
    },
    {
        canonicalName: 'The Lough',
        macroRegion: 'Cork City (South)',
        aliases: ['the lough', 'lough', 'lough rd', 'lough road', 'hartlands ave', 'hartland ave', 'greenmount', 'green mount', 'bandon rd', 'barrack st', 'barrack street']
    },
    {
        canonicalName: 'Glasheen',
        macroRegion: 'Cork City (South)',
        aliases: ['glasheen', 'glasheen rd', 'glasheen road', 'florence place', 'magazine rd', 'magazine road', 'college rd', 'college road', 'ucc campus']
    },
    {
        canonicalName: 'Wilton',
        macroRegion: 'Cork City (South)',
        aliases: ['wilton', 'cuh', 'wilton rd', 'wilton road', 'sarsfield rd', 'sarsfield road', 'bishopstown ave', 'wilton gardens', 'cardinal court', 'victoria cross']
    },
    {
        canonicalName: 'Bishopstown',
        macroRegion: 'Cork City (South)',
        aliases: ['bishopstown', 'bishop town', 'curraheen', 'curraheen rd', 'melbourn', 'bishopscourt', 'hawthorn', 'ardrostig', 'model farm', 'model farm rd', 'model farm road', 'mtu', 'cit']
    },
    {
        canonicalName: 'Blackrock',
        macroRegion: 'Cork City (South)',
        aliases: ['blackrock', 'black rock', 'castle rd', 'castle road', 'skehard rd', 'skehard road', 'convent rd', 'blackrock rd', 'blackrock road', 'marina', 'centre park rd', 'monahan rd']
    },
    {
        canonicalName: 'Mahon',
        macroRegion: 'Cork City (South)',
        aliases: ['mahon', 'mahon point', 'mahon drive', 'ringmahon', 'ringmahon rd', 'jacobs island', 'eden', 'carrigmore']
    },
    {
        canonicalName: 'Ballinlough',
        macroRegion: 'Cork City (South)',
        aliases: ['ballinlough', 'balinlough', 'ballinlough rd', 'ballinlough road', 'boreenmanna rd', 'boreenmanna road', 'wallace ave']
    },
    {
        canonicalName: 'Rochestown',
        macroRegion: 'Cork City (South)',
        aliases: ['rochestown', 'rochestown rd', 'rochestown road', 'mount oval', 'monastery hill', 'cinnamon alley', 'clarkes hill']
    },

    // ── 3. Satellite Towns & Greater Cork ──
    {
        canonicalName: 'Ballincollig',
        macroRegion: 'Satellite Towns',
        aliases: ['ballincollig', 'ballincolig', 'balincollig', 'ballincollig town', 'innishmore', 'powdermills', 'muskerry', 'coolroe', 'classis', 'maglin'],
        eircodePrefixes: ['P31']
    },
    {
        canonicalName: 'Blarney',
        macroRegion: 'Satellite Towns',
        aliases: ['blarney', 'tower', 'killeens', 'cloghroe', 'waterloo', 'blarney village', 'station rd blarney']
    },
    {
        canonicalName: 'Carrigaline',
        macroRegion: 'Satellite Towns',
        aliases: ['carrigaline', 'carrigalin', 'carigaline', 'crosshaven', 'crosshaven rd', 'shannonpark', 'herons wood', 'janeville'],
        eircodePrefixes: ['P43']
    },
    {
        canonicalName: 'Passage West / Monkstown',
        macroRegion: 'Satellite Towns',
        aliases: ['passage west', 'passagewest', 'monkstown', 'glenbrook', 'pembroke', 'rockenham']
    },
    {
        canonicalName: 'Cobh',
        macroRegion: 'Satellite Towns',
        aliases: ['cobh', 'cove', 'rushbrooke', 'ballymore', 'great island', 'belvelly', 'custume barracks'],
        eircodePrefixes: ['P85']
    },
    {
        canonicalName: 'Midleton',
        macroRegion: 'Satellite Towns',
        aliases: ['midleton', 'midelton', 'middleton', 'ballinacurra', 'castleredmond', 'broomfield midleton'],
        eircodePrefixes: ['P25']
    },
    {
        canonicalName: 'Carrigtwohill',
        macroRegion: 'Satellite Towns',
        aliases: ['carrigtwohill', 'carrigtwohil', 'carrigtohill', 'barryscourt', 'fota', 'fota island', 'tullagreen']
    },
    {
        canonicalName: 'Glanmire',
        macroRegion: 'Satellite Towns',
        aliases: ['glanmire', 'riverstown', 'sallybrook', 'brooklodge', 'hazelwood', 'glanmire village', 'upper glanmire']
    },
    {
        canonicalName: 'Little Island',
        macroRegion: 'Satellite Towns',
        aliases: ['little island', 'littleisland', 'courtstown', 'harbour point']
    },
    {
        canonicalName: 'Ringaskiddy',
        macroRegion: 'Satellite Towns',
        aliases: ['ringaskiddy', 'shanbally', 'barnahely', 'loughbeg']
    },

    // ── 4. County Cork (East, West, North) ──
    {
        canonicalName: 'Youghal',
        macroRegion: 'East Cork',
        aliases: ['youghal', 'front strand', 'redbarn', 'killeagh', 'castlemartyr', 'cloyne', 'rostellan', 'whitegate', 'aghada', 'ballycotton', 'east cork'],
        eircodePrefixes: ['P36']
    },
    {
        canonicalName: 'Bandon',
        macroRegion: 'West Cork',
        aliases: ['bandon', 'innishannon', 'crossbarry', 'halfway', 'timoleague', 'courtmacsherry'],
        eircodePrefixes: ['P72']
    },
    {
        canonicalName: 'Kinsale',
        macroRegion: 'West Cork',
        aliases: ['kinsale', 'compass hill', 'scilly', 'summercove', 'ballinspittle', 'darrara', 'belgooly'],
        eircodePrefixes: ['P17']
    },
    {
        canonicalName: 'Clonakilty',
        macroRegion: 'West Cork',
        aliases: ['clonakilty', 'clon', 'inchydoney', 'rosscarbery', 'arfield', 'owenahincha']
    },
    {
        canonicalName: 'Skibbereen & West Cork',
        macroRegion: 'West Cork',
        aliases: ['skibbereen', 'bantry', 'dunmanway', 'schull', 'baltimore', 'castletownbere', 'glengarriff', 'coolea', 'macroom', 'west cork'],
        eircodePrefixes: ['P81', 'P75', 'P47', 'P12']
    },
    {
        canonicalName: 'Mallow',
        macroRegion: 'North Cork',
        aliases: ['mallow', 'buttevant', 'doneraile', 'dromahane', 'mourneabbey'],
        eircodePrefixes: ['P51']
    },
    {
        canonicalName: 'Fermoy',
        macroRegion: 'North Cork',
        aliases: ['fermoy', 'rathcormac', 'watergrasshill', 'castlelyons', 'kilworth'],
        eircodePrefixes: ['P61']
    },
    {
        canonicalName: 'Other North Cork',
        macroRegion: 'North Cork',
        aliases: ['mitchelstown', 'charleville', 'kanturk', 'millstreet', 'newmarket', 'ballydesmond', 'north cork'],
        eircodePrefixes: ['P67', 'P56']
    }
];

const OUTSIDE_COUNTIES = [
    'dublin', 'kerry', 'killarney', 'tralee', 'limerick', 'galway', 'waterford', 'tipperary',
    'clare', 'mayo', 'wexford', 'wicklow', 'kildare', 'meath', 'louth', 'kilkenny', 'carlow',
    'laois', 'offaly', 'westmeath', 'longford', 'roscommon', 'sligo', 'leitrim', 'cavan',
    'monaghan', 'donegal'
];

// Clean address string for semantic matching
function sanitizeAddressTokens(addr: string): string[] {
    return addr
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(token => {
            if (!token || token.length < 2) return false;
            // Filter out generic noise words
            return !['cork', 'co', 'ireland', 'road', 'rd', 'street', 'st', 'avenue', 'ave', 'lane', 'ln', 'flat', 'apt', 'apartment', 'house', 'drive', 'drv', 'park', 'pk'].includes(token);
        });
}

// ─── Core Address Normalization Engine ────────────────────────

export function normalizeCorkAddress(address: string | null, eircode: string | null): NormalizedLocation {
    const rawAddr = (address || '').toLowerCase().trim();
    const rawEir = (eircode || '').toUpperCase().replace(/\s+/g, '').trim();

    if (!rawAddr && !rawEir) {
        return {
            microDistrict: 'Unknown / Not Provided',
            macroRegion: 'Other / Unknown',
            isRecognized: false
        };
    }

    // 1. Check direct exact substring match against known Cork aliases
    for (const def of DISTRICT_DEFINITIONS) {
        for (const alias of def.aliases) {
            const regex = new RegExp(`\\b${alias.replace(/\s+/g, '\\s+')}\\b`, 'i');
            if (regex.test(rawAddr)) {
                return {
                    microDistrict: def.canonicalName,
                    macroRegion: def.macroRegion,
                    isRecognized: true
                };
            }
        }
    }

    // 2. Check explicitly outside Cork counties before fallback fuzzy matching
    for (const county of OUTSIDE_COUNTIES) {
        const regex = new RegExp(`\\b${county}\\b`, 'i');
        if (regex.test(rawAddr)) {
            return {
                microDistrict: `Outside Cork (${county.charAt(0).toUpperCase() + county.slice(1)})`,
                macroRegion: 'Outside Cork',
                isRecognized: true
            };
        }
    }

    // 3. Check Eircode prefix mapping
    if (rawEir.length >= 3) {
        const eirPrefix = rawEir.substring(0, 3);
        
        // Exact prefix match in district definitions
        for (const def of DISTRICT_DEFINITIONS) {
            if (def.eircodePrefixes && def.eircodePrefixes.includes(eirPrefix)) {
                return {
                    microDistrict: def.canonicalName,
                    macroRegion: def.macroRegion,
                    isRecognized: true
                };
            }
        }

        // Broad Eircode routing rules
        if (eirPrefix === 'T12') {
            return {
                microDistrict: 'Cork City (T12 Area)',
                macroRegion: 'Cork City (South)',
                isRecognized: true
            };
        }
        if (eirPrefix === 'T23') {
            return {
                microDistrict: 'Cork City (T23 Area)',
                macroRegion: 'Cork City (North)',
                isRecognized: true
            };
        }
        if (eirPrefix === 'P25') {
            return {
                microDistrict: 'Midleton & East Cork',
                macroRegion: 'Satellite Towns',
                isRecognized: true
            };
        }
        if (eirPrefix === 'P85') {
            return {
                microDistrict: 'Cobh & Great Island',
                macroRegion: 'Satellite Towns',
                isRecognized: true
            };
        }
        if (eirPrefix === 'P31') {
            return {
                microDistrict: 'Ballincollig Area',
                macroRegion: 'Satellite Towns',
                isRecognized: true
            };
        }
        if (eirPrefix === 'P43') {
            return {
                microDistrict: 'Carrigaline Area',
                macroRegion: 'Satellite Towns',
                isRecognized: true
            };
        }
        if (eirPrefix === 'P51' || eirPrefix === 'P61') {
            return {
                microDistrict: eirPrefix === 'P51' ? 'Mallow Area' : 'Fermoy Area',
                macroRegion: 'North Cork',
                isRecognized: true
            };
        }
        if (eirPrefix === 'P72' || eirPrefix === 'P75' || eirPrefix === 'P81') {
            return {
                microDistrict: 'West Cork Area',
                macroRegion: 'West Cork',
                isRecognized: true
            };
        }
    }

    // 4. Token-level Fuzzy Matching for Cork typos (e.g. "duglas" -> "douglas", "midelton" -> "midleton")
    const tokens = sanitizeAddressTokens(rawAddr);
    let bestMatch: DistrictDefinition | null = null;
    let minDistance = Infinity;

    for (const token of tokens) {
        if (token.length < 5) continue; // Skip short tokens for fuzzy safety

        for (const def of DISTRICT_DEFINITIONS) {
            for (const alias of def.aliases) {
                const aliasTokens = alias.split(/\s+/);
                for (const aToken of aliasTokens) {
                    if (aToken.length < 5) continue;
                    
                    // Tight matching: length difference <= 1 and Levenshtein <= 1
                    if (Math.abs(token.length - aToken.length) <= 1) {
                        const dist = levenshteinDistance(token, aToken);
                        if (dist <= 1 && dist < minDistance) {
                            minDistance = dist;
                            bestMatch = def;
                        }
                    }
                }
            }
        }
    }

    if (bestMatch && minDistance <= 1) {
        return {
            microDistrict: bestMatch.canonicalName,
            macroRegion: bestMatch.macroRegion,
            isRecognized: true
        };
    }

    // 5. Fallback: Contains "cork"
    if (rawAddr.includes('cork')) {
        return {
            microDistrict: 'Other Cork Location',
            macroRegion: 'Other Cork Area',
            isRecognized: false
        };
    }

    return {
        microDistrict: 'Unspecified Address',
        macroRegion: 'Other / Unknown',
        isRecognized: false
    };
}

// ─── Export Helpers ───────────────────────────────────────────

export function copyEmailsToClipboard(emails: string[]): number {
    const validEmails = Array.from(new Set(emails.map(e => e.trim().toLowerCase()).filter(e => Boolean(e) && e.includes('@'))));
    if (validEmails.length === 0) return 0;
    const text = validEmails.join(', ');
    navigator.clipboard.writeText(text);
    return validEmails.length;
}

export function exportCustomCSV(enrollments: EnrollmentWithRelations[], filename = 'crm_export.csv') {
    if (enrollments.length === 0) return;
    
    const headers = [
        'Student ID',
        'First Name',
        'Last Name',
        'Email',
        'Phone',
        'Address',
        'Eircode',
        'Normalized District',
        'Macro Region',
        'Date of Birth',
        'Course Name',
        'Course Variant',
        'Status',
        'Priority',
        'Date Registered',
        'Invited Date',
        'Confirmed Date',
        'Completed Date',
        'Notes'
    ];

    const rows = enrollments.map(e => {
        const s = e.students;
        const c = e.courses;
        const norm = normalizeCorkAddress(s?.address || null, s?.eircode || null);
        const variant = cleanVariant(c?.name || '', e.course_variant);

        return [
            s?.id || '',
            `"${(s?.first_name || '').replace(/"/g, '""')}"`,
            `"${(s?.last_name || '').replace(/"/g, '""')}"`,
            `"${(s?.email || '').replace(/"/g, '""')}"`,
            `"${(s?.phone || '').replace(/"/g, '""')}"`,
            `"${(s?.address || '').replace(/"/g, '""')}"`,
            `"${(s?.eircode || '').replace(/"/g, '""')}"`,
            `"${norm.microDistrict}"`,
            `"${norm.macroRegion}"`,
            s?.dob ? formatDateDMY(s.dob) : '',
            `"${(c?.name || '').replace(/"/g, '""')}"`,
            `"${variant}"`,
            e.status,
            e.is_priority ? 'Yes' : 'No',
            formatDateDMY(e.created_at),
            formatDateDMY(e.invited_date),
            formatDateDMY(e.confirmed_date),
            formatDateDMY(e.completed_date),
            `"${(e.notes || '').replace(/"/g, '""')}"`
        ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
