import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import webpush from 'npm:web-push@3.6.7';

// A confirmation older than this is not announced again
const RECENT_CONFIRMATION_MS = 10 * 60 * 1000;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // 1. Initialize Supabase client with Service Role Key to bypass RLS policies
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        if (!supabaseUrl || !supabaseServiceKey) {
            throw new Error('Missing Supabase environment variables.');
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // 1.5 Authenticate caller (require valid Supabase anon/service key or valid authenticated session)
        const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
        const apiKey = req.headers.get('apikey') || req.headers.get('ApiKey');
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

        const hasValidKey = (apiKey && (apiKey === supabaseServiceKey || (supabaseAnonKey && apiKey === supabaseAnonKey))) ||
                            (authHeader && (authHeader === `Bearer ${supabaseServiceKey}` || (supabaseAnonKey && authHeader === `Bearer ${supabaseAnonKey}`)));

        if (!hasValidKey) {
            const token = authHeader?.replace(/^Bearer\s+/i, '');
            if (!token) {
                return new Response(JSON.stringify({ error: 'Unauthorized: missing authorization' }), {
                    status: 401,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }
            const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
            if (authErr || !user) {
                return new Response(JSON.stringify({ error: 'Unauthorized: invalid credentials' }), {
                    status: 401,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }
        }

        // 2. Parse request payload (should contain enrollment_id)
        const { enrollment_id } = await req.json();
        if (!enrollment_id) {
            return new Response(JSON.stringify({ error: 'Missing enrollment_id' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // 3. Fetch enrollment details (student & course names)
        const { data: enrollment, error: enrollmentError } = await supabase
            .from('enrollments')
            .select(`
                id,
                status,
                confirmed_at,
                students ( first_name, last_name ),
                courses ( name )
            `)
            .eq('id', enrollment_id)
            .single();

        if (enrollmentError || !enrollment) {
            throw new Error(`Enrollment not found: ${enrollmentError?.message || ''}`);
        }

        // The anon key is public, so anyone can call this function: only notify about
        // an enrollment that really was just confirmed (no spoofed or replayed pushes).
        const confirmedAt = enrollment.confirmed_at ? new Date(enrollment.confirmed_at).getTime() : NaN;
        if (enrollment.status !== 'confirmed' || !(Date.now() - confirmedAt <= RECENT_CONFIRMATION_MS)) {
            return new Response(JSON.stringify({ message: 'Enrollment is not a recent confirmation; nothing to notify.' }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const student = (enrollment as any).students;
        const course = (enrollment as any).courses;
        const studentName = student ? `${student.first_name} ${student.last_name}` : 'A student';
        const courseName = course?.name || 'a course';

        // 4. Fetch push subscriptions of admins only: viewers must not receive student names
        const { data: allSubscriptions, error: subsError } = await supabase
            .from('user_push_subscriptions')
            .select('*');

        if (subsError) {
            throw new Error(`Failed to fetch subscriptions: ${subsError.message}`);
        }

        const userIds = [...new Set((allSubscriptions || []).map((sub) => sub.user_id as string))];
        const adminIds = new Set<string>();
        await Promise.all(userIds.map(async (id) => {
            const { data, error } = await supabase.auth.admin.getUserById(id);
            // Same rule as is_app_admin(): anyone who is not a viewer
            if (!error && data?.user && data.user.app_metadata?.role !== 'viewer') adminIds.add(id);
        }));
        const subscriptions = (allSubscriptions || []).filter((sub) => adminIds.has(sub.user_id));

        if (!subscriptions || subscriptions.length === 0) {
            return new Response(JSON.stringify({ message: 'No push subscriptions found to notify.' }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // 5. Configure VAPID details for signing push requests
        const publicVapidKey = Deno.env.get('VAPID_PUBLIC_KEY');
        const privateVapidKey = Deno.env.get('VAPID_PRIVATE_KEY');

        if (!publicVapidKey || !privateVapidKey) {
            throw new Error('VAPID public or private key is missing in environmental variables.');
        }

        webpush.setVapidDetails(
            'mailto:admin@example.com', // Replace with admin email in production if needed
            publicVapidKey,
            privateVapidKey
        );

        // 6. Build the push payload JSON
        const payload = JSON.stringify({
            title: '✅ Enrollment Confirmed',
            body: `${studentName} confirmed for ${courseName}`,
            url: `/enrollments`, // redirects admin to registration board
            tag: `confirm-${enrollment.id}`,
            requireInteraction: true
        });

        // 7. Deliver notifications to all subscribers
        const sendPromises = subscriptions.map(async (sub) => {
            const pushSubscription = {
                endpoint: sub.endpoint,
                keys: {
                    p256dh: sub.p256dh,
                    auth: sub.auth,
                },
            };

            try {
                await webpush.sendNotification(pushSubscription, payload);
            } catch (err: any) {
                console.error(`[Edge Function] Failed to send push to subscription ${sub.id}:`, err);
                
                // If endpoint is 404 or 410 (Gone), delete the subscription from DB as it is no longer valid
                if (err.statusCode === 410 || err.statusCode === 404) {
                    await supabase
                        .from('user_push_subscriptions')
                        .delete()
                        .eq('id', sub.id);
                    console.log(`[Edge Function] Deleted expired subscription: ${sub.id}`);
                }
            }
        });

        await Promise.all(sendPromises);

        return new Response(JSON.stringify({ success: true, notified_count: subscriptions.length }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error('[Edge Function Error]:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
