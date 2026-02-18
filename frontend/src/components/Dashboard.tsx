import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Users, BookOpen, GraduationCap } from 'lucide-react';

export default function Dashboard() {
    const [stats, setStats] = useState({ students: 0, courses: 0, enrollments: 0 });

    useEffect(() => {
        async function fetchStats() {
            const { count: studentsCount } = await supabase.from('students').select('*', { count: 'exact', head: true });
            const { count: coursesCount } = await supabase.from('courses').select('*', { count: 'exact', head: true });
            const { count: enrollmentsCount } = await supabase.from('enrollments').select('*', { count: 'exact', head: true });

            setStats({
                students: studentsCount || 0,
                courses: coursesCount || 0,
                enrollments: enrollmentsCount || 0
            });
        }
        fetchStats();
    }, []);

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 flex items-center">
                <div className="p-3 bg-blue-100 rounded-full text-blue-600 mr-4">
                    <Users size={24} />
                </div>
                <div>
                    <p className="text-sm font-medium text-slate-500">Total Students</p>
                    <p className="text-2xl font-bold text-slate-800">{stats.students}</p>
                </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 flex items-center">
                <div className="p-3 bg-purple-100 rounded-full text-purple-600 mr-4">
                    <BookOpen size={24} />
                </div>
                <div>
                    <p className="text-sm font-medium text-slate-500">Active Courses</p>
                    <p className="text-2xl font-bold text-slate-800">{stats.courses}</p>
                </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 flex items-center">
                <div className="p-3 bg-green-100 rounded-full text-green-600 mr-4">
                    <GraduationCap size={24} />
                </div>
                <div>
                    <p className="text-sm font-medium text-slate-500">Total Enrollments</p>
                    <p className="text-2xl font-bold text-slate-800">{stats.enrollments}</p>
                </div>
            </div>
        </div>
    );
}
