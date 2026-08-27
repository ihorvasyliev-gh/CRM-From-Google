import type { EnrollmentWithRelations } from '../../lib/documentUtils';
import { cleanVariant } from '../../lib/types';
import { formatDateDMY } from '../../lib/dateUtils';

// ─── Location & Geographic Intelligence Types ─────────────────

export interface NormalizedLocation {
    microDistrict: string;
    macroRegion: string;
    isRecognized: boolean;
}

export interface GeographicFunnelItem {
    name: string;
    macroRegion?: string;
    total: number;
    confirmed: number;
    completed: number;
    completionRate: number;
    enrollments: EnrollmentWithRelations[];
}

export interface GeographicFunnelReport {
    microDistricts: GeographicFunnelItem[];
    macroRegions: GeographicFunnelItem[];
    topInflowDistrict: { name: string; total: number } | null;
    highestSuccessDistrict: { name: string; rate: number; total: number } | null;
    summarySplit: {
        corkCity: number;
        satelliteTowns: number;
        countyCork: number;
        outsideOrUnknown: number;
    };
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

// Helper: Levenshtein distance for fuzzy matching typos
function levenshteinDistance(s1: string, s2: string): number {
    const len1 = s1.length;
    const len2 = s2.length;
    const dp: number[][] = Array.from({ length: len1 + 1 }, () => Array(len2 + 1).fill(0));

    for (let i = 0; i <= len1; i++) dp[i][0] = i;
    for (let j = 0; j <= len2; j++) dp[0][j] = j;

    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(
                dp[i - 1][j] + 1,      // deletion
                dp[i][j - 1] + 1,      // insertion
                dp[i - 1][j - 1] + cost // substitution
            );
        }
    }
    return dp[len1][len2];
}

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

// Backward-compatible wrapper
export function classifyCorkRegion(address: string | null, eircode: string | null): string {
    const norm = normalizeCorkAddress(address, eircode);
    return norm.macroRegion;
}

// ─── Geographic Funnel Aggregation ────────────────────────────

export function calculateGeographicFunnel(enrollments: EnrollmentWithRelations[]): GeographicFunnelReport {
    const microMap = new Map<string, {
        name: string;
        macroRegion: string;
        total: number;
        confirmed: number;
        completed: number;
        enrollments: EnrollmentWithRelations[];
    }>();

    const macroMap = new Map<string, {
        name: string;
        total: number;
        confirmed: number;
        completed: number;
        enrollments: EnrollmentWithRelations[];
    }>();

    let corkCityCount = 0;
    let satelliteTownsCount = 0;
    let countyCorkCount = 0;
    let outsideOrUnknownCount = 0;

    enrollments.forEach(e => {
        const student = e.students;
        const norm = normalizeCorkAddress(student?.address || null, student?.eircode || null);

        // 1. Update Micro-district
        if (!microMap.has(norm.microDistrict)) {
            microMap.set(norm.microDistrict, {
                name: norm.microDistrict,
                macroRegion: norm.macroRegion,
                total: 0,
                confirmed: 0,
                completed: 0,
                enrollments: []
            });
        }
        const micro = microMap.get(norm.microDistrict)!;
        micro.total++;
        micro.enrollments.push(e);
        if (e.status === 'confirmed') micro.confirmed++;
        if (e.status === 'completed') micro.completed++;

        // 2. Update Macro-region
        if (!macroMap.has(norm.macroRegion)) {
            macroMap.set(norm.macroRegion, {
                name: norm.macroRegion,
                total: 0,
                confirmed: 0,
                completed: 0,
                enrollments: []
            });
        }
        const macro = macroMap.get(norm.macroRegion)!;
        macro.total++;
        macro.enrollments.push(e);
        if (e.status === 'confirmed') macro.confirmed++;
        if (e.status === 'completed') macro.completed++;

        // 3. Summary split categorization
        if (norm.macroRegion.startsWith('Cork City')) {
            corkCityCount++;
        } else if (norm.macroRegion === 'Satellite Towns') {
            satelliteTownsCount++;
        } else if (norm.macroRegion.includes('Cork') && !norm.macroRegion.includes('Outside')) {
            countyCorkCount++;
        } else {
            outsideOrUnknownCount++;
        }
    });

    const microDistricts: GeographicFunnelItem[] = Array.from(microMap.values()).map(m => ({
        ...m,
        completionRate: m.total > 0 ? Math.round((m.completed / m.total) * 100) : 0
    })).sort((a, b) => b.total - a.total);

    const macroRegions: GeographicFunnelItem[] = Array.from(macroMap.values()).map(m => ({
        ...m,
        completionRate: m.total > 0 ? Math.round((m.completed / m.total) * 100) : 0
    })).sort((a, b) => b.total - a.total);

    // Identify top inflow & top success districts
    const topInflowDistrict = microDistricts.length > 0 ? { name: microDistricts[0].name, total: microDistricts[0].total } : null;

    const completedDistricts = microDistricts.filter(m => m.total >= 3);
    const highestSuccessDistrict = completedDistricts.length > 0
        ? completedDistricts.reduce((prev, curr) => curr.completionRate > prev.completionRate ? curr : prev, completedDistricts[0])
        : (microDistricts.length > 0 ? { name: microDistricts[0].name, rate: microDistricts[0].completionRate, total: microDistricts[0].total } : null);

    return {
        microDistricts,
        macroRegions,
        topInflowDistrict,
        highestSuccessDistrict: highestSuccessDistrict ? {
            name: highestSuccessDistrict.name,
            rate: 'completionRate' in highestSuccessDistrict ? (highestSuccessDistrict as any).completionRate : (highestSuccessDistrict as any).rate,
            total: highestSuccessDistrict.total
        } : null,
        summarySplit: {
            corkCity: corkCityCount,
            satelliteTowns: satelliteTownsCount,
            countyCork: countyCorkCount,
            outsideOrUnknown: outsideOrUnknownCount
        }
    };
}

// ─── Speed and Funnel Calculations ────────────────────────────

export function calculateSpeedMetrics(enrollments: EnrollmentWithRelations[]) {
    // Time from request (created_at) to invitation (invited_at)
    const toInviteList = enrollments.filter(e => e.invited_at && e.created_at);
    const avgDaysToInvite = toInviteList.length > 0
        ? Math.round(toInviteList.reduce((acc, e) => {
            const created = new Date(e.created_at).getTime();
            const invited = new Date(e.invited_at!).getTime();
            return acc + Math.max(0, (invited - created) / (1000 * 60 * 60 * 24));
        }, 0) / toInviteList.length)
        : 0;

    // Time from invitation (invited_at) to confirmation (confirmed_at)
    const toConfirmList = enrollments.filter(e => e.confirmed_at && e.invited_at);
    const avgDaysToConfirm = toConfirmList.length > 0
        ? Math.round(toConfirmList.reduce((acc, e) => {
            const invited = new Date(e.invited_at!).getTime();
            const confirmed = new Date(e.confirmed_at!).getTime();
            return acc + Math.max(0, (confirmed - invited) / (1000 * 60 * 60 * 24));
        }, 0) / toConfirmList.length)
        : 0;

    // Time from confirmation (confirmed_at) to completion (completed_at)
    const toCompleteList = enrollments.filter(e => e.completed_at && e.confirmed_at);
    const avgDaysToComplete = toCompleteList.length > 0
        ? Math.round(toCompleteList.reduce((acc, e) => {
            const confirmed = new Date(e.confirmed_at!).getTime();
            const completed = new Date(e.completed_at!).getTime();
            return acc + Math.max(0, (completed - confirmed) / (1000 * 60 * 60 * 24));
        }, 0) / toCompleteList.length)
        : 0;

    // Overall cycle time (created_at to completed_at)
    const totalCycleList = enrollments.filter(e => e.completed_at && e.created_at);
    const avgTotalCycleDays = totalCycleList.length > 0
        ? Math.round(totalCycleList.reduce((acc, e) => {
            const created = new Date(e.created_at).getTime();
            const completed = new Date(e.completed_at!).getTime();
            return acc + Math.max(0, (completed - created) / (1000 * 60 * 60 * 24));
        }, 0) / totalCycleList.length)
        : 0;

    return {
        avgDaysToInvite,
        avgDaysToConfirm,
        avgDaysToComplete,
        avgTotalCycleDays
    };
}

export function calculateFunnelAnalysis(enrollments: EnrollmentWithRelations[]) {
    const total = enrollments.length;
    const everRequested = total;
    const everInvited = enrollments.filter(e => e.invited_date || ['invited', 'confirmed', 'completed'].includes(e.status)).length;
    const everConfirmed = enrollments.filter(e => e.confirmed_date || ['confirmed', 'completed'].includes(e.status)).length;
    const everCompleted = enrollments.filter(e => e.completed_date || e.status === 'completed').length;

    const requestedToInvited = everRequested > 0 ? Math.round((everInvited / everRequested) * 100) : 0;
    const invitedToConfirmed = everInvited > 0 ? Math.round((everConfirmed / everInvited) * 100) : 0;
    const confirmedToCompleted = everConfirmed > 0 ? Math.round((everCompleted / everConfirmed) * 100) : 0;
    const overallSuccessRate = everRequested > 0 ? Math.round((everCompleted / everRequested) * 100) : 0;

    return {
        everRequested,
        everInvited,
        everConfirmed,
        everCompleted,
        requestedToInvited,
        invitedToConfirmed,
        confirmedToCompleted,
        overallSuccessRate
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

// ─── Excel Report Builders (exceljs) ─────────────────────────

export async function exportExecutiveExcelReport(
    enrollments: EnrollmentWithRelations[],
    employmentStatuses: any[],
    filterLabel = 'All Time'
) {
    const ExcelJSModule = await import('exceljs');
    const ExcelJS = ExcelJSModule.default || ExcelJSModule;
    const FileSaverModule = await import('file-saver');
    const saveAs = FileSaverModule.saveAs || (FileSaverModule.default && FileSaverModule.default.saveAs);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'CRM System';
    workbook.created = new Date();

    // ── Sheet 1: Executive KPI Overview ──────────────────────────
    const summarySheet = workbook.addWorksheet('Executive Summary');
    
    const applySectionHeader = (rowNum: number, title: string) => {
        const row = summarySheet.getRow(rowNum);
        row.getCell(1).value = title;
        row.getCell(1).font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
        row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        summarySheet.mergeCells(rowNum, 1, rowNum, 4);
        row.height = 24;
    };

    summarySheet.columns = [
        { width: 32 },
        { width: 22 },
        { width: 22 },
        { width: 35 }
    ];

    // Title
    summarySheet.getCell('A1').value = 'CRM Executive Analytics & Performance Report';
    summarySheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF0F172A' } };
    summarySheet.getCell('A2').value = `Generated: ${new Date().toLocaleString('en-IE')} | Period: ${filterLabel}`;
    summarySheet.getCell('A2').font = { italic: true, size: 10, color: { argb: 'FF64748B' } };

    // KPI Metrics calculation
    const totalEnrollments = enrollments.length;
    const requestedCount = enrollments.filter(e => e.status === 'requested').length;
    const invitedCount = enrollments.filter(e => e.status === 'invited').length;
    const confirmedCount = enrollments.filter(e => e.status === 'confirmed').length;
    const completedCount = enrollments.filter(e => e.status === 'completed').length;
    const successRate = totalEnrollments > 0 ? Math.round((completedCount / totalEnrollments) * 100) : 0;
    
    const speed = calculateSpeedMetrics(enrollments);
    const funnel = calculateFunnelAnalysis(enrollments);
    const geoFunnel = calculateGeographicFunnel(enrollments);

    applySectionHeader(4, '1. Core Pipeline Key Performance Indicators');
    summarySheet.addRow(['Metric Name', 'Count / Value', 'Benchmark / Target', 'Notes']);
    summarySheet.getRow(5).font = { bold: true, color: { argb: 'FF334155' } };
    summarySheet.getRow(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

    summarySheet.addRow(['Total Pipeline Applications', totalEnrollments, '-', 'Total candidate registrations in scope']);
    summarySheet.addRow(['Waiting Queue (Requested)', requestedCount, '-', 'Candidates awaiting invitation']);
    summarySheet.addRow(['Invited Stage', invitedCount, '-', 'Candidates currently in invitation window']);
    summarySheet.addRow(['Confirmed Students', confirmedCount, '-', 'Confirmed attendees awaiting course start']);
    summarySheet.addRow(['Graduated / Completed', completedCount, '-', 'Successfully finished course']);
    summarySheet.addRow(['Pipeline Completion Rate', `${successRate}%`, '> 60%', 'Completed vs Total registered']);

    applySectionHeader(13, '2. Conversion Funnel & Cycle Velocity');
    summarySheet.addRow(['Stage Transition', 'Conversion Rate', 'Avg Processing Speed', 'Description']);
    summarySheet.getRow(14).font = { bold: true, color: { argb: 'FF334155' } };
    summarySheet.getRow(14).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

    summarySheet.addRow(['Requested → Invited', `${funnel.requestedToInvited}%`, `${speed.avgDaysToInvite} days`, 'Application to invitation email']);
    summarySheet.addRow(['Invited → Confirmed', `${funnel.invitedToConfirmed}%`, `${speed.avgDaysToConfirm} days`, 'Invitation email to student acceptance']);
    summarySheet.addRow(['Confirmed → Completed', `${funnel.confirmedToCompleted}%`, `${speed.avgDaysToComplete} days`, 'Course confirmation to graduation']);
    summarySheet.addRow(['Overall End-to-End Cycle', `${funnel.overallSuccessRate}%`, `${speed.avgTotalCycleDays} days`, 'Total time from application to graduate']);

    // ── Sheet 2: Geographic & Address Funnel ─────────────────────
    const geoSheet = workbook.addWorksheet('Geographic Funnel');
    geoSheet.columns = [
        { header: 'District / Town', key: 'district', width: 30 },
        { header: 'Macro Region', key: 'macro', width: 22 },
        { header: 'Applications', key: 'total', width: 16 },
        { header: 'Confirmed', key: 'confirmed', width: 14 },
        { header: 'Graduates', key: 'completed', width: 14 },
        { header: 'Completion %', key: 'rate', width: 16 }
    ];

    geoFunnel.microDistricts.forEach(m => {
        geoSheet.addRow({
            district: m.name,
            macro: m.macroRegion || '-',
            total: m.total,
            confirmed: m.confirmed,
            completed: m.completed,
            rate: `${m.completionRate}%`
        });
    });

    geoSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    geoSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    geoSheet.getRow(1).height = 24;

    // ── Sheet 3: Course Performance ──────────────────────────────
    const courseSheet = workbook.addWorksheet('Course Performance');
    courseSheet.columns = [
        { header: 'Course Name', key: 'course', width: 35 },
        { header: 'Total Applicants', key: 'total', width: 18 },
        { header: 'Invited', key: 'invited', width: 14 },
        { header: 'Confirmed', key: 'confirmed', width: 14 },
        { header: 'Completed', key: 'completed', width: 14 },
        { header: 'Completion %', key: 'completionRate', width: 16 },
        { header: 'Drop-off %', key: 'dropOffRate', width: 14 }
    ];

    const courseStats: Record<string, { total: number, invited: number, confirmed: number, completed: number }> = {};
    enrollments.forEach(e => {
        const cName = e.courses?.name || 'Unknown Course';
        if (!courseStats[cName]) {
            courseStats[cName] = { total: 0, invited: 0, confirmed: 0, completed: 0 };
        }
        courseStats[cName].total++;
        if (e.status === 'invited') courseStats[cName].invited++;
        if (e.status === 'confirmed') courseStats[cName].confirmed++;
        if (e.status === 'completed') courseStats[cName].completed++;
    });

    Object.entries(courseStats)
        .sort((a, b) => b[1].total - a[1].total)
        .forEach(([cName, data]) => {
            const compRate = data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0;
            const dropRate = 100 - compRate;
            courseSheet.addRow({
                course: cName,
                total: data.total,
                invited: data.invited,
                confirmed: data.confirmed,
                completed: data.completed,
                completionRate: `${compRate}%`,
                dropOffRate: `${dropRate}%`
            });
        });

    courseSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    courseSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    courseSheet.getRow(1).height = 24;

    // ── Sheet 4: Graduate Outcomes ───────────────────────────────
    const outcomesSheet = workbook.addWorksheet('Graduate Outcomes');
    outcomesSheet.columns = [
        { header: 'Student Name', key: 'name', width: 25 },
        { header: 'Email', key: 'email', width: 30 },
        { header: 'Completed Course', key: 'course', width: 30 },
        { header: 'Completion Date', key: 'compDate', width: 16 },
        { header: 'Survey Status', key: 'surveyStatus', width: 16 },
        { header: 'Employed?', key: 'isWorking', width: 14 },
        { header: 'Employment Type', key: 'type', width: 18 },
        { header: 'Field / Industry', key: 'field', width: 25 },
        { header: 'Started Work', key: 'started', width: 16 }
    ];

    const completedEnrollments = enrollments.filter(e => e.status === 'completed');
    completedEnrollments.forEach(e => {
        const s = e.students;
        const emp = employmentStatuses.find(es => es.student_id === s?.id);
        outcomesSheet.addRow({
            name: `${s?.first_name || ''} ${s?.last_name || ''}`,
            email: s?.email || '',
            course: e.courses?.name || '',
            compDate: e.completed_date ? formatDateDMY(e.completed_date) : (e.confirmed_date ? formatDateDMY(e.confirmed_date) : ''),
            surveyStatus: emp ? emp.status : 'not_contacted',
            isWorking: emp?.is_working === true ? 'Yes' : (emp?.is_working === false ? 'No' : 'Unreported'),
            type: emp?.employment_type || '-',
            field: emp?.field_of_work || '-',
            started: emp?.started_month || '-'
        });
    });

    outcomesSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    outcomesSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    outcomesSheet.getRow(1).height = 24;

    // ── Sheet 5: Full Participants Roster ─────────────────────────
    const rosterSheet = workbook.addWorksheet('Full Participants Roster');
    rosterSheet.columns = [
        { header: 'First Name', key: 'first', width: 18 },
        { header: 'Last Name', key: 'last', width: 18 },
        { header: 'Email', key: 'email', width: 28 },
        { header: 'Phone', key: 'phone', width: 18 },
        { header: 'Normalized District', key: 'district', width: 22 },
        { header: 'Macro Region', key: 'macro', width: 20 },
        { header: 'Course', key: 'course', width: 25 },
        { header: 'Variant', key: 'variant', width: 18 },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Priority', key: 'priority', width: 10 },
        { header: 'Registered Date', key: 'created', width: 16 }
    ];

    enrollments.forEach(e => {
        const s = e.students;
        const norm = normalizeCorkAddress(s?.address || null, s?.eircode || null);
        rosterSheet.addRow({
            first: s?.first_name || '',
            last: s?.last_name || '',
            email: s?.email || '',
            phone: s?.phone || '',
            district: norm.microDistrict,
            macro: norm.macroRegion,
            course: e.courses?.name || '',
            variant: cleanVariant(e.courses?.name || '', e.course_variant),
            status: e.status,
            priority: e.is_priority ? 'Yes' : 'No',
            created: formatDateDMY(e.created_at)
        });
    });

    rosterSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    rosterSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    rosterSheet.getRow(1).height = 24;

    // Save Workbook
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `Executive_CRM_Analytics_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
