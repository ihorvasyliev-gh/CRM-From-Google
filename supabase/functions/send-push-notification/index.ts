import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import webpush from 'npm:web-push@3.6.7';

// A confirmation older than this is not announced again
const RECENT_CONFIRMATION_MS = 10 * 60 * 1000;

const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN') || '*';

const corsHeaders = {
    'Access-Control-Allow-Origin': allowedOrigin,
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

        // 2. Parse request payload safely (should contain enrollment_id)
        let body: Record<string, unknown>;
        try {
            const parsed = await req.json();
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                return new Response(JSON.stringify({ error: 'Invalid JSON payload' }), {
                    status: 400,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }
            body = parsed as Record<string, unknown>;
        } catch {
            return new Response(JSON.stringify({ error: 'Invalid JSON payload' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const enrollment_id = typeof body.enrollment_id === 'string' ? body.enrollment_id.trim() : '';
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
            console.warn(`[Edge Function] Enrollment not found (${enrollment_id}):`, enrollmentError?.message || '');
            return new Response(JSON.stringify({ error: 'Enrollment not found' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
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

        // 4. Configure VAPID details before claiming so misconfiguration never suppresses future retries
        const publicVapidKey = Deno.env.get('VAPID_PUBLIC_KEY');
        const privateVapidKey = Deno.env.get('VAPID_PRIVATE_KEY');
        const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:noreply@corkcitypartnership.ie';

        if (!publicVapidKey || !privateVapidKey) {
            throw new Error('VAPID public or private key is missing in environmental variables.');
        }

        webpush.setVapidDetails(
            vapidSubject,
            publicVapidKey,
            privateVapidKey
        );

        // 5. Atomically claim this enrollment notification so concurrent or replayed calls
        //    cannot send duplicate push alerts (with graceful fallback if migration 98 is not yet applied).
        const { data: claimed, error: claimError } = await supabase
            .from('enrollments')
            .update({ confirmed_push_sent_at: new Date().toISOString() })
            .eq('id', enrollment_id)
            .is('confirmed_push_sent_at', null)
            .select('id');

        if (claimError) {
            const isMissingColumn =
                claimError.code === '42703' ||
                claimError.code === 'PGRST204' ||
                /confirmed_push_sent_at/i.test(claimError.message || '');
            if (!isMissingColumn) {
                throw new Error(`Failed to claim enrollment notification: ${claimError.message}`);
            }
            console.warn('[Edge Function] confirmed_push_sent_at column missing (migration 98 not yet applied); skipping deduplication.');
        } else if (!claimed || claimed.length === 0) {
            return new Response(JSON.stringify({ message: 'Push notification already sent for this enrollment.' }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const student = (enrollment as any).students;
        const course = (enrollment as any).courses;
        const studentName = student ? `${student.first_name} ${student.last_name}` : 'A student';
        const courseName = course?.name || 'a course';

        // 6. Fetch push subscriptions of admins only (positive allowlist matching is_app_admin())
        const { data: allSubscriptions, error: subsError } = await supabase
            .from('user_push_subscriptions')
            .select('id, user_id, endpoint, p256dh, auth');

        if (subsError) {
            throw new Error(`Failed to fetch subscriptions: ${subsError.message}`);
        }

        if (!allSubscriptions || allSubscriptions.length === 0) {
            return new Response(JSON.stringify({ message: 'No push subscriptions found to notify.' }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const userIds = [...new Set(allSubscriptions.map((sub) => sub.user_id as string).filter(Boolean))];
        const adminIds = new Set<string>();
        await Promise.all(userIds.map(async (id) => {
            const { data, error } = await supabase.auth.admin.getUserById(id);
            // Positive allowlist matching is_app_admin(): only explicit 'admin' or legacy missing role
            const role = data?.user?.app_metadata?.role;
            if (!error && data?.user && (!role || role === 'admin')) {
                adminIds.add(id);
            }
        }));
        const subscriptions = allSubscriptions.filter((sub) => adminIds.has(sub.user_id));

        if (subscriptions.length === 0) {
            return new Response(JSON.stringify({ message: 'No admin push subscriptions found to notify.' }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // 7. Build the push payload JSON
        const payload = JSON.stringify({
            title: '✅ Enrollment Confirmed',
            body: `${studentName} confirmed for ${courseName}`,
            url: `/enrollments`, // redirects admin to registration board
            tag: `confirm-${enrollment.id}`,
            requireInteraction: true
        });

        // 8. Deliver notifications to all admin subscribers
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
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
