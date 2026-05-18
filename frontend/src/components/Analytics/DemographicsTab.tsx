import { useMemo } from 'react';
import { 
    ResponsiveContainer, 
    BarChart, 
    Bar, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip as RechartsTooltip, 
    Cell,
    PieChart,
    Pie,
    Legend
} from 'recharts';
import { BookOpen, Users, Tags } from 'lucide-react';
import type { EnrollmentWithRelations } from '../../lib/documentUtils';
import { cleanVariant } from '../../lib/types';

interface DemographicsTabProps {
    enrollments: EnrollmentWithRelations[];
    onDrillDown: (title: string, data: EnrollmentWithRelations[]) => void;
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="glass dark:glass-dark p-3 rounded-xl shadow-lg border border-border-subtle backdrop-blur-xl z-50">
                <p className="text-sm font-semibold text-primary mb-1">{label || payload[0]?.payload?.name}</p>
                {payload.map((entry: any, index: number) => (
                    <p key={`item-${index}`} className="text-xs font-medium flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color || entry.fill }} />
                        <span className="text-muted">{entry.name}:</span> 
                        <span className="text-primary font-bold">{entry.value}</span>
                    </p>
                ))}
            </div>
        );
    }
    return null;
};

export default function DemographicsTab({ enrollments, onDrillDown }: DemographicsTabProps) {
    // ─── Data Processing ──────────────────────────────────────────

    // 1. Course Popularity
    const courseData = useMemo(() => {
        const counts: Record<string, { count: number, items: any[] }> = {};
        enrollments.forEach(e => {
            const name = e.courses?.name || 'Unknown Course';
            if (!counts[name]) counts[name] = { count: 0, items: [] };
            counts[name].count++;
            counts[name].items.push(e);
        });
        return Object.entries(counts)
            .map(([name, data]) => ({ name, count: data.count, items: data.items }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 8); // Top 8
    }, [enrollments]);

    // 2. Course Variants (e.g. Pre-intermediate)
    const variantData = useMemo(() => {
        const counts: Record<string, { count: number, items: any[] }> = {};
        enrollments.forEach(e => {
            const variant = cleanVariant(e.courses?.name || '', e.course_variant);
            if (!counts[variant]) counts[variant] = { count: 0, items: [] };
            counts[variant].count++;
            counts[variant].items.push(e);
        });
        return Object.entries(counts)
            .map(([name, data]) => ({ name, count: data.count, items: data.items }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 6);
    }, [enrollments]);

    // 3. Age Demographics
    const ageData = useMemo(() => {
        const groups = {
            'Under 18': { count: 0, items: [] as any[] },
            '18 - 25': { count: 0, items: [] as any[] },
            '26 - 35': { count: 0, items: [] as any[] },
            '36 - 50': { count: 0, items: [] as any[] },
            '51+': { count: 0, items: [] as any[] },
            'Unknown': { count: 0, items: [] as any[] }
        };

        const currentYear = new Date().getFullYear();

        enrollments.forEach(e => {
            const dob = e.students?.dob;
            if (!dob) {
                groups['Unknown'].count++;
                groups['Unknown'].items.push(e);
                return;
            }
            
            const birthYear = new Date(dob).getFullYear();
            if (isNaN(birthYear)) {
                groups['Unknown'].count++;
                groups['Unknown'].items.push(e);
                return;
            }

            const age = currentYear - birthYear;
            
            if (age < 18) { groups['Under 18'].count++; groups['Under 18'].items.push(e); }
            else if (age <= 25) { groups['18 - 25'].count++; groups['18 - 25'].items.push(e); }
            else if (age <= 35) { groups['26 - 35'].count++; groups['26 - 35'].items.push(e); }
            else if (age <= 50) { groups['36 - 50'].count++; groups['36 - 50'].items.push(e); }
            else { groups['51+'].count++; groups['51+'].items.push(e); }
        });

        const colors = ['#6366f1', '#8b5cf6', '#d946ef', '#f43f5e', '#f97316', '#64748b'];
        
        return Object.entries(groups)
            .filter(([_, data]) => data.count > 0)
            .map(([name, data], idx) => ({
                name,
                value: data.count,
                color: colors[idx % colors.length],
                items: data.items
            }));
    }, [enrollments]);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fadeIn">
            
            {/* Top Courses */}
            <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5 flex flex-col min-h-[350px]">
                <h3 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2 mb-6">
                    <BookOpen size={16} className="text-brand-500" /> Top Courses
                </h3>
                <div className="flex-1 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart 
                            data={courseData} 
                            layout="vertical" 
                            margin={{ top: 0, right: 30, left: 0, bottom: 0 }}
                            onClick={(data: any) => {
                                if (data && data.activePayload && data.activePayload[0]) {
                                    const payload = data.activePayload[0].payload;
                                    onDrillDown(`Course: ${payload.name}`, payload.items);
                                }
                            }}
                        >
                            <defs>
                                <linearGradient id="colorCourse" x1="0" y1="0" x2="1" y2="0">
                                    <stop offset="0%" stopColor="#6366f1" />
                                    <stop offset="100%" stopColor="#8b5cf6" />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="rgb(var(--border-subtle))" />
                            <XAxis type="number" hide />
                            <YAxis 
                                dataKey="name" 
                                type="category" 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fill: 'rgb(var(--text-muted))', fontSize: 11, fontWeight: 500 }}
                                width={110}
                            />
                            <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'rgb(var(--border-subtle))', opacity: 0.2 }} />
                            <Bar 
                                dataKey="count" 
                                name="Enrollments"
                                radius={[0, 4, 4, 0]} 
                                barSize={24}
                                fill="url(#colorCourse)"
                                className="cursor-pointer"
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Age Demographics */}
            <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5 flex flex-col min-h-[350px]">
                <h3 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2 mb-6">
                    <Users size={16} className="text-brand-500" /> Age Distribution
                </h3>
                <div className="flex-1 w-full relative">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={ageData}
                                cx="50%"
                                cy="50%"
                                innerRadius={70}
                                outerRadius={110}
                                paddingAngle={2}
                                dataKey="value"
                                stroke="none"
                                onClick={(data: any) => {
                                    if (data && data.payload) {
                                        onDrillDown(`Age Group: ${data.name}`, data.payload.items);
                                    }
                                }}
                                className="cursor-pointer outline-none"
                            >
                                {ageData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} className="hover:opacity-80 transition-opacity outline-none" />
                                ))}
                            </Pie>
                            <RechartsTooltip content={<CustomTooltip />} />
                            <Legend 
                                verticalAlign="bottom" 
                                height={36} 
                                iconType="circle"
                                formatter={(value: string) => <span className="text-xs text-primary font-medium mr-2">{value}</span>}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Top Variants */}
            <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5 flex flex-col min-h-[350px] lg:col-span-2">
                <h3 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2 mb-6">
                    <Tags size={16} className="text-brand-500" /> Top Variants (Levels / Modalities)
                </h3>
                <div className="flex-1 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart 
                            data={variantData} 
                            margin={{ top: 20, right: 0, left: -20, bottom: 0 }}
                            onClick={(data: any) => {
                                if (data && data.activePayload && data.activePayload[0]) {
                                    const payload = data.activePayload[0].payload;
                                    onDrillDown(`Variant: ${payload.name}`, payload.items);
                                }
                            }}
                        >
                            <defs>
                                <linearGradient id="colorVariant" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#10b981" />
                                    <stop offset="100%" stopColor="#059669" />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgb(var(--border-subtle))" />
                            <XAxis 
                                dataKey="name" 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fill: 'rgb(var(--text-muted))', fontSize: 11 }}
                                dy={10}
                            />
                            <YAxis 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fill: 'rgb(var(--text-muted))', fontSize: 11 }}
                            />
                            <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'rgb(var(--border-subtle))', opacity: 0.2 }} />
                            <Bar 
                                dataKey="count" 
                                name="Enrollments"
                                radius={[4, 4, 0, 0]} 
                                barSize={40}
                                fill="url(#colorVariant)"
                                className="cursor-pointer"
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

        </div>
    );
}
