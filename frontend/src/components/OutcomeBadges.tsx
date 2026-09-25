// Shared by the Outcomes graduates table and the External lists (OutreachLists).
import { Briefcase, CheckCircle, Mail, Send } from 'lucide-react';

type TrackingStatus = 'not_contacted' | 'pending' | 'responded';

const pillCls = 'inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full';

export function TrackingBadge({ status }: { status: TrackingStatus }) {
    if (status === 'responded') return <span className={`${pillCls} bg-success/15 text-status-confirmed`}><CheckCircle size={10} /> Responded</span>;
    if (status === 'pending') return <span className={`${pillCls} bg-info/15 text-status-invited`}><Send size={10} /> Pending</span>;
    return <span className={`${pillCls} bg-muted/15 text-muted`}><Mail size={10} /> Not Contacted</span>;
}

export function EmploymentBadge({ status, row }: {
    status: TrackingStatus;
    row: { is_working: boolean | null; employment_type: string | null; field_of_work: string | null };
}) {
    if (status !== 'responded') return <span className="text-xs text-muted italic">No data</span>;
    if (!row.is_working) return <span className={`${pillCls} bg-orange-500/20 text-orange-400`}>Not working</span>;
    const type = row.employment_type === 'full_time' ? 'Full-time' : row.employment_type === 'part_time' ? 'Part-time' : '';
    return (
        <div className="flex items-center gap-1.5">
            <span className={`${pillCls} bg-success/15 text-status-confirmed`}>
                <Briefcase size={10} /> Working {type && `· ${type}`}
            </span>
            {row.field_of_work && <span className="text-[10px] text-muted">in {row.field_of_work}</span>}
        </div>
    );
}
