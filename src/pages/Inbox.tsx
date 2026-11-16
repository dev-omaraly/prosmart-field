import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../auth';
import { supabase } from '../lib/supabase';
import { L, btn, card, fmt, inp } from '../ui';

interface Item {
  notification_id: string;
  read_at: string | null;
  notifications: { title: string; body: string | null; created_at: string } | null;
}

export default function Inbox() {
  const { profile, session } = useAuth();
  const uid = session!.user.id;
  const [items, setItems] = useState<Item[]>([]);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('notification_recipients')
      .select('notification_id,read_at,notifications(title,body,created_at)')
      .eq('user_id', uid);
    const list = (data ?? []) as unknown as Item[];
    setItems(list.sort((a, b) => (b.notifications?.created_at ?? '').localeCompare(a.notifications?.created_at ?? '')));
  }, [uid]);
  useEffect(() => {
    load();
  }, [load]);

  const markRead = async (id: string) => {
    await supabase.from('notification_recipients').update({ read_at: new Date().toISOString() }).eq('notification_id', id).eq('user_id', uid);
    load();
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">التنبيهات والتذكيرات</h1>
      {profile?.role === 'admin' && <Compose onSent={load} />}
      <div className="space-y-2">
        {items.map((i) => (
          <button key={i.notification_id} onClick={() => !i.read_at && markRead(i.notification_id)} className={card + ' block w-full text-start ' + (i.read_at ? 'opacity-60' : 'border-brand/60')}>
            <div className="flex justify-between">
              <b>{!i.read_at && '● '}{i.notifications?.title}</b>
              <span className="text-xs text-white/50">{i.notifications && fmt(i.notifications.created_at)}</span>
            </div>
            {i.notifications?.body && <p className="mt-1 whitespace-pre-wrap text-sm text-white/80">{i.notifications.body}</p>}
          </button>
        ))}
        {!items.length && <p className="text-white/50">مفيش تنبيهات.</p>}
      </div>
    </div>
  );
}

function Compose({ onSent }: { onSent: () => void }) {
  const [people, setPeople] = useState<{ id: string; full_name: string }[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    supabase.from('profiles').select('id,full_name').eq('is_active', true).then(({ data }) => setPeople(data ?? []));
  }, []);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!sel.length) return setMsg('اختار شخص واحد على الأقل');
    const { data, error } = await supabase.from('notifications').insert({ title, body: body || null }).select('id').single();
    if (error || !data) return setMsg(error?.message ?? 'خطأ');
    const { error: e2 } = await supabase.from('notification_recipients').insert(sel.map((u) => ({ notification_id: data.id, user_id: u })));
    if (e2) return setMsg(e2.message);
    setTitle(''); setBody(''); setSel([]); setMsg('تم الإرسال ✓');
    onSent();
  };

  return (
    <form onSubmit={send} className={card + ' space-y-3'}>
      <L t="عنوان الرسالة"><input required className={inp} value={title} onChange={(e) => setTitle(e.target.value)} /></L>
      <L t="نص الرسالة"><textarea rows={3} className={inp} value={body} onChange={(e) => setBody(e.target.value)} /></L>
      <div className="space-y-1">
        <div className="flex justify-between text-sm text-white/70">
          <span>المستلمين</span>
          <button type="button" className="text-brand" onClick={() => setSel(sel.length === people.length ? [] : people.map((p) => p.id))}>الكل</button>
        </div>
        {people.map((p) => (
          <label key={p.id} className="flex items-center gap-2 rounded-xl bg-navy-800 px-3 py-2">
            <input type="checkbox" checked={sel.includes(p.id)} onChange={() => setSel(sel.includes(p.id) ? sel.filter((x) => x !== p.id) : [...sel, p.id])} />
            {p.full_name || 'بدون اسم'}
          </label>
        ))}
      </div>
      {msg && <p className="text-sm text-brand">{msg}</p>}
      <button className={btn + ' w-full'}>إرسال</button>
    </form>
  );
}
