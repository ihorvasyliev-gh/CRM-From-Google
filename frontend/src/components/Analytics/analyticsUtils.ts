import type { EnrollmentWithRelations } from '../../lib/documentUtils';
import { cleanVariant } from '../../lib/types';
import { formatDateDMY } from '../../lib/dateUtils';

// ─── Regional Classification ──────────────────────────────────
export function classifyCorkRegion(address: string | null, eircode: string | null): string {
    const addr = (address || '').toLowerCase().trim();
    const eir = (eircode || '').toUpperCase().replace(/\s+/g, '').trim();

    // 1. Check Eircode prefixes first
    if (eir.startsWith('T12') || eir.startsWith('T23')) {
        return 'Cork City';
    }
    if (eir.startsWith('P25')) {
        return 'East Cork';
    }
    if (eir.startsWith('P75') || eir.startsWith('P85') || eir.startsWith('P24')) {
        if (eir.startsWith('P75')) return 'West Cork';
        if (eir.startsWith('P85')) return 'East Cork';
    }
    if (eir.startsWith('P51') || eir.startsWith('P61') || eir.startsWith('P81')) {
        return 'North Cork';
    }
    if (eir.startsWith('P72') || eir.startsWith('P36') || eir.startsWith('P12')) {
        return 'West Cork';
    }
    if (eir.startsWith('P31') || eir.startsWith('P32') || eir.startsWith('P43') || eir.startsWith('P47')) {
        return 'South Cork';
    }

    // 2. Fallback to Address string matching
    if (addr.includes('city centre') || addr.includes('city center') || addr.includes('cork city') || 
        addr.includes('douglas') || addr.includes('togher') || addr.includes('grange') || 
        addr.includes('blackrock') || addr.includes('ballyvolane') || addr.includes('mayfield') || 
        addr.includes('glanmire') || addr.includes('turners cross') || addr.includes('montenotte') || 
        addr.includes('bishopstown') || addr.includes('wilton') || addr.includes('ballyphehane') || 
        addr.includes('gurranabraher') || addr.includes('shandon')) {
        return 'Cork City';
    }
    
    if (addr.includes('midleton') || addr.includes('youghal') || addr.includes('cobh') || 
        addr.includes('carrigtwohill') || addr.includes('killeagh') || addr.includes('castlemartyr') || 
        addr.includes('rostellan') || addr.includes('cloyne') || addr.includes('east cork')) {
        return 'East Cork';
    }

    if (addr.includes('bandon') || addr.includes('bantry') || addr.includes('kinsale') || 
        addr.includes('clonakilty') || addr.includes('skibbereen') || addr.includes('dunmanway') || 
        addr.includes('schull') || addr.includes('macroom') || addr.includes('coolea') || 
        addr.includes('glengarriff') || addr.includes('castletownbere') || addr.includes('west cork')) {
        return 'West Cork';
    }

    if (addr.includes('mallow') || addr.includes('fermoy') || addr.includes('mitchelstown') || 
        addr.includes('charleville') || addr.includes('kanturk') || addr.includes('millstreet') || 
        addr.includes('buttevant') || addr.includes('doneraile') || addr.includes('north cork')) {
        return 'North Cork';
    }

    if (addr.includes('carrigaline') || addr.includes('ballincollig') || addr.includes('passage west') || 
        addr.includes('ringaskiddy') || addr.includes('monkstown') || addr.includes('south cork')) {
        return 'South Cork';
    }

    if (addr.includes('cork')) {
        return 'Other Cork Area';
    }

    return 'Other / Unknown';
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
        'Region',
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
        const region = classifyCorkRegion(s?.address || null, s?.eircode || null);
        const variant = cleanVariant(c?.name || '', e.course_variant);

        return [
            s?.id || '',
            `"${(s?.first_name || '').replace(/"/g, '""')}"`,
            `"${(s?.last_name || '').replace(/"/g, '""')}"`,
            `"${(s?.email || '').replace(/"/g, '""')}"`,
            `"${(s?.phone || '').replace(/"/g, '""')}"`,
            `"${(s?.address || '').replace(/"/g, '""')}"`,
            `"${(s?.eircode || '').replace(/"/g, '""')}"`,
            `"${region}"`,
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

    // ── Sheet 2: Course Performance ──────────────────────────────
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

    // Group by course
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

    // ── Sheet 3: Employment Outcomes ─────────────────────────────
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

    // ── Sheet 4: Full Participants Roster ─────────────────────────
    const rosterSheet = workbook.addWorksheet('Full Participants Roster');
    rosterSheet.columns = [
        { header: 'First Name', key: 'first', width: 18 },
        { header: 'Last Name', key: 'last', width: 18 },
        { header: 'Email', key: 'email', width: 28 },
        { header: 'Phone', key: 'phone', width: 18 },
        { header: 'Cork Region', key: 'region', width: 18 },
        { header: 'Course', key: 'course', width: 25 },
        { header: 'Variant', key: 'variant', width: 18 },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Priority', key: 'priority', width: 10 },
        { header: 'Registered Date', key: 'created', width: 16 }
    ];

    enrollments.forEach(e => {
        const s = e.students;
        const region = classifyCorkRegion(s?.address || null, s?.eircode || null);
        rosterSheet.addRow({
            first: s?.first_name || '',
            last: s?.last_name || '',
            email: s?.email || '',
            phone: s?.phone || '',
            region,
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
