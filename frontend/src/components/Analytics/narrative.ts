import { AGE_GROUPS, NOT_KNOWN, type Insights, type Share } from './insights';
import { formatPeriodLabel } from './summaryReport';

/**
 * The report's words: plain sentences written from the figures (no AI service, nothing leaves
 * the browser). Each function returns the sentences of one section; a sentence is left out when
 * there is nothing to say (no earlier period, no survey answers, one course only…).
 */

export interface ReportHighlights {
    /** 2–3 concise executive bullets for Page 1's Key Highlights callout */
    bullets: string[];
    /** Concise single-line lead takeaways for each visual section */
    leads: {
        courses: string;
        pipeline: string;
        outcomes: string;
        people: string;
    };
}

export interface Narrative {
    /** The period at a glance */
    summary: string[];
    /** Which courses were asked for and delivered */
    courses: string[];
    /** Where the period's registrations stand, and the queue today */
    pipeline: string[];
    /** The employment survey */
    outcomes: string[];
    /** Who registered: language, area, age */
    people: string[];
    /** Concise executive takeaways and single-line section leads for the PDF report */
    highlights: ReportHighlights;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const count = (n: number) => n.toLocaleString('en-IE');

export function plural(n: number, one: string, many = `${one}s`): string {
    return `${count(n)} ${n === 1 ? one : many}`;
}

/** Whole percent of `part` in `whole`; 0 when there is no whole. */
export function percent(part: number, whole: number): number {
    return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/** Whole-number percentage label, or "<1%" for a non-zero share under 0.5%. */
export function formatPercent(part: number, whole: number): string {
    if (whole <= 0 || part <= 0) return '0%';
    const pct = Math.round((part / whole) * 100);
    return pct === 0 ? '<1%' : `${pct}%`;
}

/** "A", "A and B", "A, B and C". */
export function listOf(items: string[]): string {
    if (items.length <= 1) return items[0] ?? '';
    return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const be = (n: number) => (n === 1 ? 'is' : 'are');

const monthName = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;

/** "up 18% (349 → 412)", "down 5% (225 → 214)", "unchanged (40)". */
function change(before: number, now: number): string {
    if (before === now) return `unchanged (${count(now)})`;
    if (before === 0) return `up from none to ${count(now)}`;
    const pct = Math.round((Math.abs(now - before) / before) * 100);
    return `${now > before ? 'up' : 'down'} ${pct}% (${count(before)} → ${count(now)})`;
}

const named = (shares: Share[]) => shares.filter(s => s.name !== NOT_KNOWN);

function summarySentences(d: Insights): string[] {
    const { summary: s, previous } = d;
    const period = formatPeriodLabel(d.period);
    if (s.registrations === 0 && s.completions === 0) {
        return [`There were no registrations or course completions in the period ${period}.`];
    }
    const out: string[] = [];
    out.push(
        `In the period ${period}, ${plural(s.peopleRegistered, 'person', 'people')} registered for a course ` +
        `(${plural(s.registrations, 'course registration')}) and ${plural(s.peopleCompleted, 'person', 'people')} ` +
        `completed one (${plural(s.completions, 'completion')}).`,
    );
    if (previous) {
        out.push(
            `Compared with ${formatPeriodLabel(previous.period)}, registrations were ${change(previous.registrations, s.registrations)} ` +
            `and completions were ${change(previous.completions, s.completions)}.`,
        );
    }
    if (s.courseRuns > 0) {
        const perRun = Math.round((s.completions / s.courseRuns) * 10) / 10;
        out.push(
            `${plural(s.courseRuns, 'course run')} with graduates ${s.courseRuns === 1 ? 'was' : 'were'} held across ` +
            `${plural(s.coursesDelivered, 'course')}, about ${count(perRun)} ${perRun === 1 ? 'graduate' : 'graduates'} per run.`,
        );
    }
    if (s.months.length >= 3) {
        const topRegistered = s.months.reduce((a, b) => (b.registered > a.registered ? b : a));
        const topCompleted = s.months.reduce((a, b) => (b.completed > a.completed ? b : a));
        const parts: string[] = [];
        if (topRegistered.registered > 0) parts.push(`${monthName(topRegistered.month)} was the busiest month for registrations (${count(topRegistered.registered)})`);
        if (topCompleted.completed > 0) {
            parts.push(
                topCompleted.month === topRegistered.month && parts.length
                    ? `it also had the most completions (${count(topCompleted.completed)})`
                    : `most completions were in ${monthName(topCompleted.month)} (${count(topCompleted.completed)})`,
            );
        }
        if (parts.length) out.push(`${parts.join('; ').replace(/^./, c => c.toUpperCase())}.`);
    }
    if (d.multiCourse > 0) {
        out.push(`${plural(d.multiCourse, 'person', 'people')} completed more than one course in the period.`);
    }
    return out;
}

function courseSentences(d: Insights): string[] {
    const { summary: s } = d;
    const out: string[] = [];
    const byDemand = s.courses.filter(c => c.registered > 0);
    if (byDemand.length > 1) {
        const [first, ...rest] = byDemand;
        const next = rest.slice(0, 2).map(c => `${c.name} (${count(c.registered)})`);
        out.push(
            `Demand was highest for ${first.name}: ${plural(first.registered, 'registration')}, ` +
            `${percent(first.registered, s.registrations)}% of all. Next came ${listOf(next)}.`,
        );
    } else if (byDemand.length === 1) {
        out.push(`All ${plural(byDemand[0].registered, 'registration')} were for ${byDemand[0].name}.`);
    }
    const byCompleted = s.courses.filter(c => c.completed > 0).sort((a, b) => b.completed - a.completed);
    if (byCompleted.length > 1) {
        const top = byCompleted[0];
        out.push(
            `The most completions were in ${top.name} (${count(top.completed)} over ${plural(top.runs, 'run')}), ` +
            `${percent(top.completed, s.completions)}% of all completions.`,
        );
    }
    const notDelivered = s.courses.filter(c => c.registered > 0 && c.completed === 0);
    if (notDelivered.length > 0 && byCompleted.length > 0) {
        const shown = notDelivered.length <= 4 ? notDelivered : notDelivered.slice(0, 3);
        const more = notDelivered.length - shown.length;
        const items = shown.map(c => `${c.name} (${count(c.registered)})`);
        if (more > 0) items.push(`${count(more)} more`);
        out.push(
            `${plural(notDelivered.length, 'course')} had registrations but no completions in the period: ${listOf(items)}.`,
        );
    }
    return out;
}

function pipelineSentences(d: Insights): string[] {
    const { fates: f, queue: q } = d;
    const out: string[] = [];
    if (f.total > 0) {
        const parts = [
            f.completed > 0 && `${count(f.completed)} (${formatPercent(f.completed, f.total)}) ${f.completed === 1 ? 'has' : 'have'} already completed the course`,
            f.confirmed + f.invited > 0 && `${count(f.confirmed + f.invited)} (${formatPercent(f.confirmed + f.invited, f.total)}) ${be(f.confirmed + f.invited)} confirmed or invited`,
            f.waiting > 0 && `${count(f.waiting)} (${formatPercent(f.waiting, f.total)}) ${be(f.waiting)} still waiting for an invitation`,
            f.left > 0 && `${count(f.left)} (${formatPercent(f.left, f.total)}) withdrew or ${f.left === 1 ? 'was' : 'were'} not accepted`,
        ].filter(Boolean) as string[];
        out.push(`Of the ${plural(f.total, 'registration')} made in the period, ${listOf(parts)}.`);
        if (d.summary.completions > f.completed) {
            out.push(
                `In total there were ${plural(d.summary.completions, 'completion')} in the period, including ${count(d.summary.completions - f.completed)} from people who registered earlier.`,
            );
        } else if (f.completed > d.summary.completions) {
            out.push(
                `${count(f.completed - d.summary.completions)} of those completions took place after the period ended.`,
            );
        }
    }
    const active = q.waiting + q.invited + q.confirmed;
    const queueDiffersFromPeriod =
        f.total === 0 || q.waiting !== f.waiting || q.invited !== f.invited || q.confirmed !== f.confirmed;
    if (active > 0) {
        if (queueDiffersFromPeriod) {
            const queueParts = [
                q.waiting > 0 && `${plural(q.waiting, 'registration is', 'registrations are')} waiting for an invitation`,
                q.invited > 0 && `${count(q.invited)} ${be(q.invited)} invited and waiting for a reply`,
                q.confirmed > 0 && `${count(q.confirmed)} ${be(q.confirmed)} confirmed for a coming date`,
            ].filter(Boolean) as string[];
            out.push(`Across all periods today, ${listOf(queueParts)}.`);
        }
        const longest = q.courses.filter(c => c.waiting > 0).slice(0, 3);
        if (longest.length > 1) {
            out.push(`The longest waiting lists are ${listOf(longest.map(c => `${c.name} (${count(c.waiting)})`))}.`);
        } else if (longest.length === 1) {
            out.push(`Everyone waiting is waiting for ${longest[0].name}.`);
        }
    } else {
        out.push('Nobody is waiting, invited or confirmed at the moment.');
    }
    return out;
}

function employmentSplit(o: Insights['outcomes']): string[] {
    return [
        o.fullTime && `${count(o.fullTime)} full-time`,
        o.partTime && `${count(o.partTime)} part-time`,
        o.selfEmployed && `${count(o.selfEmployed)} self-employed`,
        o.ceTus && `${count(o.ceTus)} on CE / TUS`,
    ].filter(Boolean) as string[];
}

function outcomeSentences(d: Insights): string[] {
    const o = d.outcomes;
    if (o.graduates === 0) return ['Nobody completed a course in the period, so there are no employment outcomes to report.'];
    const out: string[] = [];
    if (o.asked === 0) {
        out.push(`None of the ${plural(o.graduates, 'graduate')} in the period has been sent the employment survey yet.`);
        return out;
    }
    if (o.responded === 0) {
        out.push(
            `${count(o.asked)} of the ${plural(o.graduates, 'graduate')} in the period ` +
            `(${percent(o.asked, o.graduates)}%) were sent the employment survey; none have answered yet.`,
        );
        return out;
    }
    const awaiting = o.asked - o.responded;
    out.push(
        `${count(o.asked)} of the ${plural(o.graduates, 'graduate')} in the period ` +
        `(${percent(o.asked, o.graduates)}%) were sent the employment survey; ${count(o.responded)} (${percent(o.responded, o.asked)}%) answered` +
        `${awaiting > 0 ? ` and ${count(awaiting)} ${awaiting === 1 ? 'has' : 'have'} not replied yet` : ''}.`,
    );
    const split = employmentSplit(o);
    if (o.working > 0) {
        const notWorkingClause = o.notWorking > 0 ? `, while ${count(o.notWorking)} reported not working yet` : '';
        out.push(
            `Based on the responses received, ${count(o.working)} of the ${count(o.asked)} surveyed graduates ` +
            `(${percent(o.working, o.asked)}%) ${be(o.working)} confirmed to be working` +
            `${split.length ? ` (${listOf(split)})` : ''}${notWorkingClause}.`,
        );
    } else {
        out.push(`None of the ${count(o.asked)} surveyed graduates (${count(o.responded)} answered) reported working yet.`);
    }
    const namedFields = o.fields.filter(f => f.name !== 'Other' && f.name !== NOT_KNOWN);
    const multiFields = namedFields.filter(f => f.count >= 2).slice(0, 3);
    if (multiFields.length > 1) {
        out.push(`The most common sectors are ${listOf(multiFields.map(f => `${f.name} (${count(f.count)})`))}.`);
    } else if (multiFields.length === 1) {
        out.push(`The most common sector is ${multiFields[0].name} (${count(multiFields[0].count)}).`);
    } else if (namedFields.length === 1) {
        out.push(`Reported sector of work: ${namedFields[0].name} (${count(namedFields[0].count)}).`);
    } else if (namedFields.length > 1) {
        out.push(`Reported sectors include ${listOf(namedFields.slice(0, 3).map(f => f.name))}.`);
    }
    if (o.responded < 10) {
        out.push(`With only ${plural(o.responded, 'answer')}, these figures are an early indication.`);
    }
    return out;
}

function peopleSentences(d: Insights): string[] {
    const p = d.people;
    if (p.total === 0) return [];
    const out: string[] = [];

    if (p.languages.length > 1) {
        const [first, ...rest] = p.languages;
        out.push(
            `${percent(first.count, p.total)}% of the people who registered chose a course in ${first.name}; ` +
            `${listOf(rest.slice(0, 3).map(l => `${percent(l.count, p.total)}% in ${l.name}`))}.`,
        );
    }

    const areas = named(p.areas);
    const unknownArea = p.areas.find(a => a.name === NOT_KNOWN)?.count ?? 0;
    if (areas.length > 0) {
        const [first, ...rest] = areas;
        let text = `Most live in ${first.name} (${percent(first.count, p.total)}%)`;
        if (rest.length) text += `, followed by ${listOf(rest.slice(0, 2).map(a => `${a.name} (${percent(a.count, p.total)}%)`))}`;
        text += '.';
        if (unknownArea > 0) text += ` ${percent(unknownArea, p.total)}% gave no address that could be placed.`;
        out.push(text);
    }

    const ages = named(p.ages);
    const unknownAge = p.ages.find(a => a.name === NOT_KNOWN)?.count ?? 0;
    if (ages.length > 0) {
        const known = p.total - unknownAge;
        const top = ages.reduce((a, b) => (b.count > a.count ? b : a));
        const youngest = ages.filter(a => a.name === AGE_GROUPS[0] || a.name === AGE_GROUPS[1]).reduce((sum, a) => sum + a.count, 0);
        let text = `The largest age group is ${top.name} (${percent(top.count, known)}% of those with a date of birth)`;
        if (youngest > 0 && top.name !== AGE_GROUPS[1]) text += `; ${percent(youngest, known)}% are under 25`;
        text += '.';
        if (unknownAge > 0) text += ` The date of birth is missing for ${percent(unknownAge, p.total)}%.`;
        out.push(text);
    }
    return out;
}

function buildHighlights(d: Insights): ReportHighlights {
    const { summary: s, previous, fates: f, queue: q, outcomes: o, people: p } = d;
    const empty = s.registrations === 0 && s.completions === 0;
    const periodLabel = formatPeriodLabel(d.period);

    const byDemand = s.courses.filter(c => c.registered > 0);
    const byCompleted = s.courses.filter(c => c.completed > 0).sort((a, b) => b.completed - a.completed);
    const notDelivered = s.courses.filter(c => c.registered > 0 && c.completed === 0);

    // ── Executive bullets (Page 1) ──
    const bullets: string[] = [];
    if (empty) {
        bullets.push(`No registrations or course completions were recorded in ${periodLabel}.`);
    } else {
        if (previous) {
            bullets.push(
                `Compared with ${formatPeriodLabel(previous.period)}, course registrations were ${change(previous.registrations, s.registrations)} ` +
                `and completions were ${change(previous.completions, s.completions)}.`,
            );
        } else if (s.courseRuns > 0) {
            const perRun = Math.round((s.completions / s.courseRuns) * 10) / 10;
            bullets.push(
                `${plural(s.courseRuns, 'course run')} with graduates delivered across ${plural(s.coursesDelivered, 'course')}, ` +
                `averaging ${count(perRun)} ${perRun === 1 ? 'graduate' : 'graduates'} per run.`,
            );
        }

        if (s.months.length >= 3) {
            const topReg = s.months.reduce((a, b) => (b.registered > a.registered ? b : a));
            const topComp = s.months.reduce((a, b) => (b.completed > a.completed ? b : a));
            const parts: string[] = [];
            if (topReg.registered > 0) parts.push(`registrations peaked in ${monthName(topReg.month)} (${count(topReg.registered)})`);
            if (topComp.completed > 0) {
                parts.push(
                    topComp.month === topReg.month && parts.length
                        ? `which also saw the most completions (${count(topComp.completed)})`
                        : `most completions were in ${monthName(topComp.month)} (${count(topComp.completed)})`,
                );
            }
            if (parts.length) bullets.push(`${parts.join('; ').replace(/^./, c => c.toUpperCase())}.`);
        } else if (s.courseRuns > 0 && previous) {
            const perRun = Math.round((s.completions / s.courseRuns) * 10) / 10;
            bullets.push(
                `${plural(s.courseRuns, 'course run')} with graduates delivered across ${plural(s.coursesDelivered, 'course')}, ` +
                `averaging ${count(perRun)} ${perRun === 1 ? 'graduate' : 'graduates'} per run.`,
            );
        }

        if (notDelivered.length > 0 && byCompleted.length > 0) {
            const unmetRegs = notDelivered.reduce((sum, c) => sum + c.registered, 0);
            const shown = notDelivered.length <= 4 ? notDelivered : notDelivered.slice(0, 3);
            const more = notDelivered.length - shown.length;
            const names = shown.map(c => `${c.name} (${count(c.registered)})`);
            if (more > 0) names.push(`${count(more)} more`);
            bullets.push(
                `Unmet demand: ${plural(notDelivered.length, 'course')} recorded ${plural(unmetRegs, 'registration')} with no completions yet — ${listOf(names)}.`,
            );
        } else if (d.multiCourse > 0) {
            bullets.push(
                `Repeat progression: ${plural(d.multiCourse, 'participant')} completed two or more different courses in the period.`,
            );
        } else if (o.asked > 0 && o.responded > 0) {
            bullets.push(
                `Post-course employment: ${count(o.working)} of ${count(o.asked)} surveyed graduates (${percent(o.working, o.asked)}%) ${be(o.working)} confirmed working (${count(o.responded)} responses).`,
            );
        }

        if (bullets.length < 3 && d.multiCourse > 0 && !bullets.some(b => b.includes('Repeat progression'))) {
            bullets.push(
                `Repeat progression: ${plural(d.multiCourse, 'participant')} completed two or more different courses in the period.`,
            );
        }
    }

    // ── Section leads ──
    let coursesLead = '';
    if (!empty) {
        if (byDemand.length === 1) {
            coursesLead = `All ${plural(byDemand[0].registered, 'registration')} were for ${byDemand[0].name}.`;
        } else if (byDemand.length > 1) {
            const topComp = byCompleted[0];
            coursesLead =
                `${byDemand[0].name} led demand (${count(byDemand[0].registered)} · ${percent(byDemand[0].registered, s.registrations)}%)` +
                `${topComp ? `, while ${topComp.name} delivered the most completions (${count(topComp.completed)} across ${plural(topComp.runs, 'run')}, ${percent(topComp.completed, s.completions)}%)` : ''}.`;
        }
    }

    let pipelineLead: string;
    if (f.total > 0) {
        const parts = [
            f.completed > 0 && `${count(f.completed)} (${formatPercent(f.completed, f.total)}) completed`,
            f.confirmed + f.invited > 0 && `${count(f.confirmed + f.invited)} (${formatPercent(f.confirmed + f.invited, f.total)}) confirmed or invited`,
            f.waiting > 0 && `${count(f.waiting)} (${formatPercent(f.waiting, f.total)}) waiting`,
            f.left > 0 && `${count(f.left)} (${formatPercent(f.left, f.total)}) withdrew / not accepted`,
        ].filter(Boolean) as string[];
        pipelineLead = `Of ${plural(f.total, 'registration')} made in the period, ${listOf(parts)}.`;
        if (s.completions > f.completed) {
            pipelineLead += ` Including ${count(s.completions - f.completed)} earlier registrants, total period completions reached ${count(s.completions)}.`;
        } else if (f.completed > s.completions) {
            pipelineLead += ` ${count(f.completed - s.completions)} of those completed after the period ended.`;
        }
    } else if (q.waiting + q.invited + q.confirmed === 0) {
        pipelineLead = 'No registrations in this period and nobody is in the active queue today.';
    } else {
        pipelineLead = `No registrations in this period; ${plural(q.waiting, 'registration is', 'registrations are')} waiting in the overall queue today.`;
    }

    let outcomesLead: string;
    if (o.graduates === 0) {
        outcomesLead = 'No graduates completed a course in this period, so there are no employment outcomes to report.';
    } else if (o.asked === 0) {
        outcomesLead = `None of the ${plural(o.graduates, 'graduate')} in the period has been sent the employment survey yet.`;
    } else if (o.responded === 0) {
        outcomesLead = `${count(o.asked)} of ${plural(o.graduates, 'graduate')} (${percent(o.asked, o.graduates)}%) received the employment survey; none have replied yet.`;
    } else {
        const split = employmentSplit(o);
        const awaiting = o.asked - o.responded;
        outcomesLead =
            `${count(o.asked)} of ${plural(o.graduates, 'graduate')} (${percent(o.asked, o.graduates)}%) were surveyed; ` +
            `${count(o.responded)} (${percent(o.responded, o.asked)}%) answered${awaiting > 0 ? ` (${count(awaiting)} awaiting reply)` : ''}, ` +
            `and ${count(o.working)} of ${count(o.asked)} surveyed (${percent(o.working, o.asked)}%) ${be(o.working)} confirmed working` +
            `${o.working > 0 && split.length ? ` (${listOf(split)})` : ''}.` +
            `${o.responded < 10 ? ` Early indication based on ${plural(o.responded, 'response')}.` : ''}`;
    }

    let peopleLead = '';
    if (p.total > 0) {
        const bits: string[] = [];
        if (p.languages.length > 0) {
            const topLang = p.languages[0];
            bits.push(`${percent(topLang.count, p.total)}% chose ${topLang.name}`);
        }
        const areas = named(p.areas);
        if (areas.length > 0) {
            bits.push(`most live in ${areas[0].name} (${percent(areas[0].count, p.total)}%)`);
        }
        const ages = named(p.ages);
        if (ages.length > 0) {
            const unknownAge = p.ages.find(a => a.name === NOT_KNOWN)?.count ?? 0;
            const known = p.total - unknownAge;
            const topAge = ages.reduce((a, b) => (b.count > a.count ? b : a));
            bits.push(`the largest age group is ${topAge.name} (${percent(topAge.count, known)}% of known)`);
        }
        if (bits.length > 0) {
            peopleLead = `Across ${plural(p.total, 'unique registrant')}: ${listOf(bits)}.`;
        }
    }

    return {
        bullets: bullets.slice(0, 3),
        leads: {
            courses: coursesLead,
            pipeline: pipelineLead,
            outcomes: outcomesLead,
            people: peopleLead,
        },
    };
}

export function buildNarrative(d: Insights): Narrative {
    const empty = d.summary.registrations === 0 && d.summary.completions === 0;
    return {
        summary: summarySentences(d),
        courses: empty ? [] : courseSentences(d),
        pipeline: pipelineSentences(d),
        outcomes: outcomeSentences(d),
        people: peopleSentences(d),
        highlights: buildHighlights(d),
    };
}
