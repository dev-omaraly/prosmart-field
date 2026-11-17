// Supabase Edge Function: send-push
// Triggered by a database trigger on notification_recipients (see sql/step9_push_webhook.sql).
// Secrets required: FIREBASE_SERVICE_ACCOUNT (full JSON), WEBHOOK_SECRET
import { createClient } from 'npm:@supabase/supabase-js@2';

const SA = JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT') ?? '{}');
const SECRET = Deno.env.get('WEBHOOK_SECRET') ?? '';
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const CHANNEL = 'prosmart_alerts_v1'; // must match src/lib/push.ts

const b64url = (b: ArrayBuffer | string) => {
  const bytes = typeof b === 'string' ? new TextEncoder().encode(b) : new Uint8Array(b);
  let s = '';
  bytes.forEach((c) => (s += String.fromCharCode(c)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

let cached: { token: string; exp: number } | null = null;
async function accessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp > now + 60) return cached.token;
  const pem = (SA.private_key as string).replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(
    JSON.stringify({
      iss: SA.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${claim}`));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${head}.${claim}.${b64url(sig)}`,
    }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error('oauth failed: ' + JSON.stringify(j));
  cached = { token: j.access_token, exp: now + (j.expires_in ?? 3600) };
  return cached.token;
}

Deno.serve(async (req) => {
  if (!SECRET || req.headers.get('x-webhook-secret') !== SECRET) return new Response('forbidden', { status: 403 });
  try {
    const payload = await req.json();
    const rec = payload.record as { notification_id: string; user_id: string };
    if (!rec?.notification_id || !rec?.user_id) return new Response('no record', { status: 400 });

    const { data: n } = await db.from('notifications').select('title,body,work_order_id').eq('id', rec.notification_id).single();
    const { data: toks } = await db.from('device_tokens').select('token').eq('user_id', rec.user_id);
    if (!n || !toks?.length) return new Response('nothing to send');

    const at = await accessToken();
    const body = (n.body ?? '').length > 160 ? n.body.slice(0, 157) + '…' : n.body ?? '';
    let sent = 0;
    for (const { token } of toks) {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${SA.project_id}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: n.title, body },
            data: { notification_id: rec.notification_id, work_order_id: n.work_order_id ?? '' },
            android: {
              priority: 'HIGH',
              notification: {
                channel_id: CHANNEL,
                sound: 'prosmart_alert',
                visibility: 'PUBLIC',
                notification_priority: 'PRIORITY_HIGH',
                default_vibrate_timings: true,
              },
            },
          },
        }),
      });
      if (res.ok) sent++;
      else {
        const t = await res.text();
        if (t.includes('UNREGISTERED') || t.includes('INVALID_ARGUMENT')) await db.from('device_tokens').delete().eq('token', token);
        console.error('fcm error', res.status, t);
      }
    }
    return new Response(JSON.stringify({ sent }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error(e);
    return new Response(String(e), { status: 500 });
  }
});
