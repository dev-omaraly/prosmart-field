import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import Photos from '../../components/Photos';
import { Badge, L, btn, card, fmt, inp, taskLabel } from '../../ui';

interface Tech {
  id: string;
  full_name: string;
}
interface Row {
  id: string;
  order_no: number;
  client_name: string;
  location_text: string;
  scheduled_at: string;
  status: string;
  team_leader_id: string | null;
  work_order_tasks: { id: string; title: string; assigned_to: string; bonus: number; status: string; tech_note: string | null }[];
  work_order_techs: {
    tech_id: string;
    arrived_at: string | null;
    departed_at: string | null;
    profiles: { full_name: string } | null;
  }[];
}

export default function Orders() {
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('work_orders')
      .select('*, work_order_tasks(id,title,assigned_to,bonus,status,tech_note), work_order_techs(tech_id,arrived_at,departed_at,profiles(full_name))')
      .order('scheduled_at', { ascending: false });
    setRows((data ?? []) as unknown as Row[]);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const review = async (id: string, status: string) => {
    await supabase.from('work_order_tasks').update({ status }).eq('id', id);
    load();
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">أوامر الشغل</h1>
        <button className={btn + ' flex items-center gap-1'} onClick={() => setOpen(!open)}>
          <Plus size={16} />
          أمر جديد
        </button>
      </div>
      {open && (
        <NewOrder
          onDone={() => {
            setOpen(false);
            load();
          }}
        />
      )}
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.id} className={card}>
            <div className="flex justify-between">
              <b>
                #{r.order_no} · {r.client_name}
              </b>
              <Badge s={r.status} />
            </div>
            <div className="mt-1 text-sm text-white/60">{r.location_text}</div>
            <div className="text-sm text-white/60">{fmt(r.scheduled_at)}</div>
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
              {r.work_order_techs.map((t) => (
                <span key={t.tech_id} className="rounded-lg bg-navy-700 px-2 py-1">
                  {t.tech_id === r.team_leader_id ? '⭐ ' : ''}
                  {t.profiles?.full_name}
                  {t.departed_at ? ' ✓ انصرف' : t.arrived_at ? ' ✓ وصل' : ''}
                </span>
              ))}
            </div>
            {r.work_order_tasks.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {r.work_order_tasks.map((t) => {
                  const who = r.work_order_techs.find((x) => x.tech_id === t.assigned_to)?.profiles?.full_name;
                  return (
                    <div key={t.id} className="rounded-xl bg-navy-800 p-2 text-sm">
                      <div className="flex justify-between gap-2">
                        <span>{t.title} · {who} · {t.bonus} ج</span>
                        <span className="whitespace-nowrap text-xs text-brand">{taskLabel[t.status]}</span>
                      </div>
                      {t.tech_note && <p className="text-xs text-white/60">{t.tech_note}</p>}
                      {t.status === 'done' && (
                        <div className="mt-1 flex gap-2">
                          <button onClick={() => review(t.id, 'approved')} className="rounded-lg bg-brand px-3 py-1 text-xs font-bold text-navy-950">موافقة</button>
                          <button onClick={() => review(t.id, 'rejected')} className="rounded-lg border border-red-300/50 px-3 py-1 text-xs text-red-200">رفض</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-3">
              <Photos orderId={r.id} />
            </div>
          </div>
        ))}
        {!rows.length && <p className="text-white/50">مفيش أوامر لسه.</p>}
      </div>
    </div>
  );
}

function NewOrder({ onDone }: { onDone: () => void }) {
  const [techs, setTechs] = useState<Tech[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  const [leader, setLeader] = useState('');
  const [tasks, setTasks] = useState<{ title: string; assigned_to: string; bonus: number }[]>([]);
  const upd = (i: number, k: string, v: string | number) =>
    setTasks(tasks.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const [f, setF] = useState({
    client_name: '',
    client_phone: '',
    location_text: '',
    location_url: '',
    scheduled_at: '',
    details: '',
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id,full_name')
      .eq('role', 'technician')
      .eq('is_active', true)
      .then(({ data }) => setTechs((data ?? []) as Tech[]));
  }, []);

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value });
  const toggle = (id: string) =>
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!sel.length) return setErr('اختار فني واحد على الأقل');
    if (!leader || !sel.includes(leader)) return setErr('اختار التيم ليدر من الفنيين المختارين');
    setBusy(true);
    setErr('');
    const { data, error } = await supabase
      .from('work_orders')
      .insert({
        ...f,
        location_url: f.location_url || null,
        details: f.details || null,
        scheduled_at: new Date(f.scheduled_at).toISOString(),
        team_leader_id: leader,
      })
      .select('id')
      .single();
    if (error || !data) {
      setErr(error?.message ?? 'حصل خطأ');
      setBusy(false);
      return;
    }
    const { error: e2 } = await supabase
      .from('work_order_techs')
      .insert(sel.map((t) => ({ work_order_id: data.id, tech_id: t })));
    const tk = tasks.filter((t) => t.title.trim() && sel.includes(t.assigned_to));
    if (!e2 && tk.length) {
      const { error: e3 } = await supabase
        .from('work_order_tasks')
        .insert(tk.map((t) => ({ ...t, work_order_id: data.id })));
      if (e3) {
        setBusy(false);
        return setErr(e3.message);
      }
    }
    setBusy(false);
    if (e2) return setErr(e2.message);
    onDone();
  };

  return (
    <form onSubmit={submit} className={card + ' mb-4 space-y-3'}>
      <L t="اسم العميل">
        <input required className={inp} value={f.client_name} onChange={set('client_name')} />
      </L>
      <L t="رقم العميل">
        <input required type="tel" dir="ltr" className={inp} value={f.client_phone} onChange={set('client_phone')} />
      </L>
      <L t="العنوان">
        <input required className={inp} value={f.location_text} onChange={set('location_text')} />
      </L>
      <L t="رابط اللوكيشن (جوجل ماب)">
        <input dir="ltr" className={inp} value={f.location_url} onChange={set('location_url')} />
      </L>
      <L t="الميعاد والساعة">
        <input required type="datetime-local" className={inp} value={f.scheduled_at} onChange={set('scheduled_at')} />
      </L>
      <L t="تفاصيل الشغلانة">
        <textarea rows={3} className={inp} value={f.details} onChange={set('details')} />
      </L>
      <div className="space-y-1">
        <span className="text-sm text-white/70">الفنيين</span>
        {techs.map((t) => (
          <div key={t.id} className="flex items-center justify-between rounded-xl bg-navy-800 px-3 py-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={sel.includes(t.id)} onChange={() => toggle(t.id)} />
              {t.full_name || 'بدون اسم'}
            </label>
            {sel.includes(t.id) && (
              <label className="flex items-center gap-1 text-xs text-brand">
                <input type="radio" name="leader" checked={leader === t.id} onChange={() => setLeader(t.id)} />
                تيم ليدر
              </label>
            )}
          </div>
        ))}
        {!techs.length && <p className="text-sm text-white/50">مفيش فنيين مسجلين لسه.</p>}
      </div>
      <div className="space-y-2">
        <span className="text-sm text-white/70">المهام (مهمة وبونص لكل فني)</span>
        {tasks.map((t, i) => (
          <div key={i} className="grid grid-cols-6 gap-2 rounded-xl bg-navy-800 p-2">
            <input placeholder="المهمة (سمارت، كاميرات...)" className={inp + ' col-span-6'} value={t.title} onChange={(e) => upd(i, 'title', e.target.value)} />
            <select className={inp + ' col-span-3'} value={t.assigned_to} onChange={(e) => upd(i, 'assigned_to', e.target.value)}>
              <option value="">لمين؟</option>
              {techs.filter((x) => sel.includes(x.id)).map((x) => (
                <option key={x.id} value={x.id}>{x.full_name}</option>
              ))}
            </select>
            <input type="number" min={0} placeholder="البونص" className={inp + ' col-span-2'} value={t.bonus} onChange={(e) => upd(i, 'bonus', Number(e.target.value))} />
            <button type="button" onClick={() => setTasks(tasks.filter((_, j) => j !== i))} className="text-sm text-red-300">حذف</button>
          </div>
        ))}
        <button type="button" onClick={() => setTasks([...tasks, { title: '', assigned_to: '', bonus: 0 }])} className="text-sm text-brand">+ مهمة</button>
      </div>
      {err && <p className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200">{err}</p>}
      <button disabled={busy} className={btn + ' w-full'}>
        {busy ? 'جاري الإرسال...' : 'إرسال أمر الشغل'}
      </button>
    </form>
  );
}
