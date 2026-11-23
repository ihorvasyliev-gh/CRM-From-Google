import { getAvatarGradient } from '../../lib/types';
import { adminDisplayName, adminInitials, type AdminProfile } from '../../lib/todos';

export default function AdminAvatar({
    profile,
    seed,
    size = 'xs',
}: {
    profile: AdminProfile | null | undefined;
    seed: string;
    size?: 'xs' | 'sm';
}) {
    const dims = size === 'sm' ? 'w-6 h-6 text-[10px]' : 'w-5 h-5 text-[9px]';
    return (
        <span
            title={adminDisplayName(profile)}
            className={`inline-flex items-center justify-center rounded-full bg-linear-to-br ${getAvatarGradient(seed)} text-white font-bold shrink-0 ${dims}`}
        >
            {adminInitials(profile)}
        </span>
    );
}
