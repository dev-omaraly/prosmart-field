import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowRight, ClipboardList } from 'lucide-react';
import { useAuth } from '../auth';
import { supabase } from '../lib/supabase';
import { btn, card, fmt } from '../ui';

interface Msg {
  title: string;
  body: string | null;
  created_at: string;
  work_order_id: string | null;
}

// Full message screen: opened from the inbox list or by tapping a push notification.
export default function InboxItem() {
  const { nid } = useParams();
  const { profile, session } = useAuth();
  const uid = session!.user.id;
  const base = useLocation().pathname.replace(/\/inbox.*$/, '');
  const [m, setM] = useState<Msg | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('title,body,created_at,work_order_id')
        .eq('id', nid!)
        .maybeSingle();
      if (!alive) return;
      if (error || !data) return setErr('الرسالة مش موجودة أو مالكش صلاحية عليها.');
      setM(data as Msg);
      await supabase
        .from('notification_recipients')
        .update({ read_at: new Date().toISOString() })
        .eq('notification_id', nid!)
        .eq('user_id', uid)
        .is('read_at', null);
      window.dispatchEvent(new Event('prosmart:push')); // refresh the unread dot
    })();
    return () => {
      alive = false;
    };
  }, [nid, uid]);

  // technicians open their order at /tech/:id; admins see it in the orders list
  const orderLink = m?.work_order_id ? (profile?.role === 'technician' ? `/tech/${m.work_order_id}` : '/admin') : null;

  return (
    <div className="space-y-4">
      <Link to={`${base}/inbox`} className="flex items-center gap-1 text-sm text-brand">
        <ArrowRight size={16} /> كل التنبيهات
      </Link>
      {err && <p className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200">{err}</p>}
      {!m && !err && <p className="text-white/60">جاري التحميل...</p>}
      {m && (
        <div className={card + ' space-y-3'}>
          <h1 className="text-lg font-bold">{m.title}</h1>
          <div className="text-xs text-white/50">{fmt(m.created_at)}</div>
          {m.body && <p className="whitespace-pre-wrap text-[15px] leading-7 text-white/90">{m.body}</p>}
          {orderLink && (
            <Link to={orderLink} className={btn + ' flex w-full items-center justify-center gap-2'}>
              <ClipboardList size={18} /> فتح أمر الشغل
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
