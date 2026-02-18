import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { CheckCircle, Clock, XCircle, Send } from 'lucide-react';

const STATUS_ICONS: Record<string, any> = {
    requested: <Clock size={16} className="text-yellow-600" />,
    invited: <Send size={16} className="text-blue-600" />,
    confirmed: <CheckCircle size={16} className="text-green-600" />,
    rejected: <XCircle size={16} className="text-red-600" />
};

const STATUS_COLORS: Record<string, string> = {
    requested: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    invited: 'bg-blue-50 text-blue-700 border-blue-200',
    confirmed: 'bg-green-50 text-green-700 border-green-200',
    rejected: 'bg-red-50 text-red-700 border-red-200'
};

export default function EnrollmentBoard() {
    const [courses, setCourses] = useState<any[]>([]);
    const [selectedCourse, setSelectedCourse] = useState<string>('all');
    const [enrollments, setEnrollments] = useState<any[]>([]);

    useEffect(() => {
        fetchCourses();
        fetchEnrollments();
    }, []);

    async function fetchCourses() {
        const { data } = await supabase.from('courses').select('*').order('name');
        if (data) setCourses(data);
    }

    async function fetchEnrollments() {
        const { data } = await supabase
            .from('enrollments')
            .select('*, students(first_name, last_name, email, phone), courses(name)')
            .order('created_at', { ascending: false });
        if (data) setEnrollments(data);
    }

    async function updateStatus(id: string, newStatus: string) {
        const { error } = await supabase.from('enrollments').update({ status: newStatus }).eq('id', id);
        if (!error) {
            setEnrollments(prev => prev.map(e => e.id === id ? { ...e, status: newStatus } : e));
        }
    }

    const filteredEnrollments = selectedCourse === 'all'
        ? enrollments
        : enrollments.filter(e => e.course_id === selectedCourse);

    const groupedByCourse: Record<string, any[]> = filteredEnrollments.reduce(
        (acc: Record<string, any[]>, curr: any) => {
            const courseName = curr.courses?.name || 'Unknown Course';
            if (!acc[courseName]) acc[courseName] = [];
            acc[courseName].push(curr);
            return acc;
        },
        {}
    );

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-4 rounded-lg shadow-sm border border-slate-200">
                <h2 className="text-lg font-semibold text-slate-800">Enrollments</h2>
                <select
                    className="p-2 border border-slate-300 rounded-md text-sm"
                    value={selectedCourse}
                    onChange={e => setSelectedCourse(e.target.value)}
                >
                    <option value="all">All Courses</option>
                    {courses.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Object.entries(groupedByCourse).map(([courseName, items]) => (
                    <div key={courseName} className="bg-white rounded-lg shadow-sm border border-slate-200 flex flex-col h-full max-h-[600px]">
                        <div className="p-4 border-b border-slate-200 bg-slate-50 rounded-t-lg">
                            <h3 className="font-semibold text-slate-800">{courseName}</h3>
                            <span className="text-xs text-slate-500">{items.length} students</span>
                        </div>
                        <div className="p-4 overflow-y-auto space-y-3 flex-1">
                            {items.map((enrollment: any) => (
                                <div key={enrollment.id} className="p-3 bg-white border border-slate-100 rounded-lg shadow-sm hover:shadow-md transition">
                                    <div className="flex justify-between items-start mb-2">
                                        <p className="font-medium text-slate-900">{enrollment.students?.first_name} {enrollment.students?.last_name}</p>
                                        <span className={`text-[10px] px-2 py-1 rounded-full flex items-center gap-1 border ${STATUS_COLORS[enrollment.status]}`}>
                                            {STATUS_ICONS[enrollment.status]} {enrollment.status.toUpperCase()}
                                        </span>
                                    </div>
                                    <div className="text-xs text-slate-500 space-y-1">
                                        <p>{enrollment.students?.email}</p>
                                        <p>{enrollment.students?.phone}</p>
                                        {enrollment.course_variant && <p className="text-slate-400">Variant: {enrollment.course_variant}</p>}
                                    </div>
                                    <div className="mt-3 pt-2 border-t border-slate-100 flex gap-2">
                                        <button onClick={() => updateStatus(enrollment.id, 'invited')} className="text-xs bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded text-slate-700">Invite</button>
                                        <button onClick={() => updateStatus(enrollment.id, 'confirmed')} className="text-xs bg-green-50 hover:bg-green-100 text-green-700 px-2 py-1 rounded">Confirm</button>
                                        <button onClick={() => updateStatus(enrollment.id, 'rejected')} className="text-xs text-red-600 hover:bg-red-50 px-2 py-1 rounded ml-auto">Reject</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
