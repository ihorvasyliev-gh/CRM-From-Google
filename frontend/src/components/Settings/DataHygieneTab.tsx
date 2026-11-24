import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GitMerge, History, MailX } from 'lucide-react';
import { listEmailOptOutsSafe, type EmailOptOut } from '../../lib/emailOptOut';
import { Segmented, type SegmentOption } from '../ui/Tabs';
import ActivityLogPanel from './ActivityLogPanel';
import DuplicateProfilesPanel from './DuplicateProfilesPanel';
import EmailOptOutPanel from './EmailOptOutPanel';
import type { DataHygieneSubTab, DataHygieneTabProps } from './types';

export default function DataHygieneTab({
    activeSubTab,
    onSubTabChange,
    onDuplicatesCountChange,
}: DataHygieneTabProps) {
    const [duplicatesCount, setDuplicatesCount] = useState<number | undefined>(undefined);

    const { data: optOuts = [] } = useQuery<EmailOptOut[]>({
        queryKey: ['email_opt_outs'],
        queryFn: listEmailOptOutsSafe,
    });

    const handleDuplicatesCountChange = useCallback(
        (count: number | undefined) => {
            setDuplicatesCount(count);
            onDuplicatesCountChange?.(count);
        },
        [onDuplicatesCountChange],
    );

    const subTabOptions: SegmentOption<DataHygieneSubTab>[] = useMemo(
        () => [
            {
                value: 'duplicates',
                label: 'Duplicate Profiles',
                icon: <GitMerge size={13} aria-hidden="true" />,
                count: duplicatesCount,
            },
            {
                value: 'unsubscribed',
                label: 'Unsubscribed Emails',
                icon: <MailX size={13} aria-hidden="true" />,
                count: optOuts.length,
            },
            {
                value: 'activity',
                label: 'Activity Log',
                icon: <History size={13} aria-hidden="true" />,
            },
        ],
        [duplicatesCount, optOuts.length],
    );

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <Segmented<DataHygieneSubTab>
                    options={subTabOptions}
                    value={activeSubTab}
                    onChange={onSubTabChange}
                    ariaLabel="Data & Hygiene sections"
                />
                <p className="text-xs text-muted">
                    {activeSubTab === 'duplicates'
                        ? 'Find, compare and safely merge duplicate learner profiles.'
                        : activeSubTab === 'unsubscribed'
                            ? 'Manage addresses excluded from automated invitations and surveys.'
                            : 'Immutable audit trail of deletions, merges, role updates and archived courses.'}
                </p>
            </div>

            {/* Keep DuplicateProfilesPanel mounted while viewing other sub-tabs so finished scan results persist */}
            <div className={activeSubTab === 'duplicates' ? undefined : 'hidden'}>
                <DuplicateProfilesPanel onIssuesCountChange={handleDuplicatesCountChange} />
            </div>

            {activeSubTab === 'unsubscribed' && <EmailOptOutPanel />}
            {activeSubTab === 'activity' && <ActivityLogPanel />}
        </div>
    );
}
