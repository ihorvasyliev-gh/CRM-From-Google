import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import webpush from 'npm:web-push';

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
                students ( first_name, last_name ),
                courses ( name )
            `)
            .eq('id', enrollment_id)
            .single();

        if (enrollmentError || !enrollment) {
            throw new Error(`Enrollment not found: ${enrollmentError?.message || ''}`);
        }

        const student = (enrollment as any).students;
        const course = (enrollment as any).courses;
        const studentName = student ? `${student.first_name} ${student.last_name}` : 'A student';
        const courseName = course?.name || 'a course';

        // 4. Fetch all active push subscriptions
        const { data: subscriptions, error: subsError } = await supabase
            .from('user_push_subscriptions')
            .select('*');

        if (subsError) {
            throw new Error(`Failed to fetch subscriptions: ${subsError.message}`);
        }

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
