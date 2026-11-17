// Supabase Edge Function: admin-reset-password
// Lets an admin set a new password for a user who forgot theirs.
// Uses the built-in secrets SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (nothing to add).
import { createClient } from 'npm:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const out = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user) return out({ error: 'غير مصرّح' }, 401);

    const { data: me } = await admin.from('profiles').select('role,is_active,can_manage_orders').eq('id', u.user.id).single();
    if (!me || me.role !== 'admin' || !me.is_active) return out({ error: 'للإداري بس' }, 403);

    const { user_id, password } = await req.json();
    if (!user_id || typeof password !== 'string' || password.length < 8) return out({ error: 'الباسورد لازم 8 حروف على الأقل' }, 400);

    // resetting another admin's password is reserved for the owner admin
    const { data: target } = await admin.from('profiles').select('role').eq('id', user_id).single();
    if (target?.role === 'admin' && user_id !== u.user.id && !me.can_manage_orders) {
      return out({ error: 'تغيير باسورد إداري تاني للمالك بس' }, 403);
    }

    const { error } = await admin.auth.admin.updateUserById(user_id, { password });
    if (error) return out({ error: error.message }, 400);
    return out({ ok: true });
  } catch (e) {
    return out({ error: String(e) }, 500);
  }
});
