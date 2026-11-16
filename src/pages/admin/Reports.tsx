import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { card, inp } from '../../ui';

interface T { tech_id: string; full_name: string; orders_assigned: number; orders_done: number; tasks_approved: number; bonus_total: number }
interface S { work_order_id: string; order_no: number; client_name: string; tech_name: string; tasks_done: number }

export default function Reports() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [techs, setTechs] = useState<T[]>([]);
  const [sites, setSites] = useState<S[]>([]);

  useEffect(() => {
    const args = { d_from: from || null, d_to: to || null };
    supabase.rpc('tech_report', args).then(({ data }) => setTechs((data ?? []) as T[]));
    supabase.rpc('site_report', args).then(({ data }) => setSites((data ?? []) as S[]));
  }, [from, to]);

  const bySite: Record<string, S[]> = {};
  sites.forEach((s) => (bySite[s.work_order_id] = [...(bySite[s.work_order_id] ?? []), s]));
  const totalBonus = techs.reduce((a, t) => a + Number(t.bonus_total), 0);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">التقارير</h1>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm text-white/70">من<input type="date" className={inp} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-sm text-white/70">إلى<input type="date" className={inp} value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>

      <div className={card}>
        <h2 className="mb-2 font-bold">ترتيب الفنيين (بالشغل المنجز)</h2>
        {techs.map((t, i) => (
          <div key={t.tech_id} className="flex items-center justify-between border-b border-navy-700 py-2 text-sm last:border-0">
            <span>{i === 0 && t.orders_done > 0 ? '🏆 ' : `${i + 1}. `}{t.full_name}</span>
            <span className="text-xs text-white/70">
              {t.orders_done}/{t.orders_assigned} أوامر · {t.tasks_approved} مهمة · <b className="text-brand">{Number(t.bonus_total)} ج</b>
            </span>
          </div>
        ))}
        {!techs.length && <p className="text-sm text-white/50">مفيش بيانات.</p>}
        <p className="mt-2 text-sm">إجمالي البونصات المعتمدة: <b className="text-brand">{totalBonus} ج</b></p>
      </div>

      <div className={card}>
        <h2 className="mb-2 font-bold">أكتر فني اشتغل في كل سايت (بعدد المهام)</h2>
        {Object.values(bySite).map((rows) => (
          <div key={rows[0].work_order_id} className="border-b border-navy-700 py-2 text-sm last:border-0">
            <b>#{rows[0].order_no} · {rows[0].client_name}</b>
            <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
              {rows.map((r, i) => (
                <span key={r.tech_name} className="rounded-lg bg-navy-700 px-2 py-1">{i === 0 ? '⭐ ' : ''}{r.tech_name}: {r.tasks_done}</span>
              ))}
            </div>
          </div>
        ))}
        {!sites.length && <p className="text-sm text-white/50">لسه مفيش مهام معتمدة.</p>}
      </div>
    </div>
  );
}
