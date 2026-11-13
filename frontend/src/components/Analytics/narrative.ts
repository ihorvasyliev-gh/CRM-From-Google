import { AGE_GROUPS, NOT_KNOWN, type Insights, type Share } from './insights';
import { formatPeriodLabel } from './summaryReport';

/**
 * The report's words: plain sentences written from the figures (no AI service, nothing leaves
 * the browser). Each function returns the sentences of one section; a sentence is left out when
 * there is nothing to say (no earlier period, no survey answers, one course only…).
 */

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
        const names = notDelivered.slice(0, 3).map(c => `${c.name} (${count(c.registered)})`);
        const more = notDelivered.length - names.length;
        out.push(
            `${plural(notDelivered.length, 'course')} had registrations but no completions in the period: ` +
            `${listOf(names)}${more > 0 ? ` and ${count(more)} more` : ''}.`,
        );
    }
    return out;
}

function pipelineSentences(d: Insights): string[] {
    const { fates: f, queue: q } = d;
    const out: string[] = [];
    if (f.total > 0) {
        const parts = [
            `${count(f.completed)} (${percent(f.completed, f.total)}%) ${f.completed === 1 ? 'has' : 'have'} already completed the course`,
            `${count(f.confirmed + f.invited)} ${be(f.confirmed + f.invited)} confirmed or invited`,
            `${count(f.waiting)} (${percent(f.waiting, f.total)}%) ${be(f.waiting)} still waiting for an invitation`,
            `${count(f.left)} withdrew or ${f.left === 1 ? 'was' : 'were'} not accepted`,
        ];
        out.push(`Of the ${plural(f.total, 'registration')} made in the period, ${listOf(parts)}.`);
    }
    const active = q.waiting + q.invited + q.confirmed;
    if (active > 0) {
        out.push(
            `Today ${plural(q.waiting, 'registration is', 'registrations are')} waiting for an invitation, ` +
            `${count(q.invited)} ${be(q.invited)} invited and waiting for a reply, and ` +
            `${count(q.confirmed)} ${be(q.confirmed)} confirmed for a coming date.`,
        );
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

function outcomeSentences(d: Insights): string[] {
    const o = d.outcomes;
    if (o.graduates === 0) return ['Nobody completed a course in the period, so there are no employment outcomes to report.'];
    const out: string[] = [];
    if (o.asked === 0) {
        out.push(`None of the ${plural(o.graduates, 'person', 'people')} who completed a course in the period has been sent the employment survey yet.`);
        return out;
    }
    out.push(
        `${count(o.asked)} of the ${plural(o.graduates, 'person', 'people')} who completed a course in the period ` +
        `(${percent(o.asked, o.graduates)}%) were sent the employment survey, and ${count(o.responded)} answered ` +
        `(${percent(o.responded, o.asked)}% of those asked).`,
    );
    if (o.responded === 0) return out;
    const split = [o.fullTime && `${count(o.fullTime)} full-time`, o.partTime && `${count(o.partTime)} part-time`].filter(Boolean) as string[];
    out.push(
        `${count(o.working)} of the ${count(o.asked)} people sent the survey (${percent(o.working, o.asked)}%) said they are working` +
        `${o.working > 0 && split.length ? `: ${listOf(split)}` : ''}.`,
    );
    const fields = o.fields.filter(f => f.name !== 'Other').slice(0, 3);
    if (fields.length > 1) {
        out.push(`The most common fields of work are ${listOf(fields.map(f => `${f.name} (${count(f.count)})`))}.`);
    } else if (fields.length === 1) {
        out.push(`The most common field of work is ${fields[0].name} (${count(fields[0].count)}).`);
    }
    if (o.responded < 10) {
        out.push(`With only ${plural(o.responded, 'answer')}, these percentages are a rough guide.`);
    } else if (o.responded < o.asked) {
        out.push(`${plural(o.asked - o.responded, 'person has', 'people have')} not answered yet, so the real share working may be higher.`);
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

export function buildNarrative(d: Insights): Narrative {
    const empty = d.summary.registrations === 0 && d.summary.completions === 0;
    return {
        summary: summarySentences(d),
        courses: empty ? [] : courseSentences(d),
        pipeline: pipelineSentences(d),
        outcomes: outcomeSentences(d),
        people: peopleSentences(d),
    };
}
