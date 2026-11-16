import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { MapPin, Phone, LogIn, LogOut, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { Badge, L, btn, card, fmt, inp } from '../ui';

interface Order {
  id: string;
  order_no: number;
  client_name: string;
  client_phone: string;
  location_text: string;
  location_url: string | null;
  scheduled_at: string;
  details: string | null;
  status: string;
}
interface Cred {
  id?: string;
  kind: string;
  label: string;
  ip_address: string;
  username: string;
  password: string;
}
const kinds: Record<string, string> = { camera: 'كاميرا', network: 'شبكة', intercom: 'انتركم', other: 'أخرى' };
const emptyR = {
  work_done: '',
  modules_count: 0,
  cameras_count: 0,
  intercoms_count: 0,
  cable_length_m: 0,
  client_feedback: '',
  needs_followup: false,
  followup_notes: '',
};

export default function TechOrder() {
  const { id } = useParams();
  const { session } = useAuth();
  const uid = session!.user.id;
  const [o, setO] = useState<Order | null>(null);
  const [me, setMe] = useState<{ arrived_at: string | null; departed_at: string | null } | null>(null);
  const [r, setR] = useState(emptyR);
  const [creds, setCreds] = useState<Cred[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data: ord } = await supabase.from('work_orders').select('*').eq('id', id!).single();
    setO(ord as Order);
    const { data: m } = await supabase
      .from('work_order_techs')
      .select('arrived_at,departed_at')
      .eq('work_order_id', id!)
      .eq('tech_id', uid)
      .single();
    setMe(m);
    const { data: rep } = await supabase.from('site_reports').select('*').eq('work_order_id', id!).maybeSingle();
    if (rep) {
      setR({
        work_done: rep.work_done ?? '',
        modules_count: rep.modules_count,
        cameras_count: rep.cameras_count,
        intercoms_count: rep.intercoms_count,
        cable_length_m: Number(rep.cable_length_m),
        client_feedback: rep.client_feedback ?? '',
        needs_followup: rep.needs_followup,
        followup_notes: rep.followup_notes ?? '',
      });
      const { data: c } = await supabase.from('report_credentials').select('*').eq('report_id', rep.id);
      setCreds(
        (c ?? []).map((x) => ({
          id: x.id,
          kind: x.kind,
          label: x.label ?? '',
          ip_address: x.ip_address ?? '',
          username: x.username ?? '',
          password: x.password ?? '',
        })),
      );
    }
  }, [id, uid]);
  useEffect(() => {
    load();
  }, [load]);

  const arrive = async () => {
    setBusy(true);
    const pos = await new Promise<GeolocationPosition | null>((res) =>
      navigator.geolocation
        ? navigator.geolocation.getCurrentPosition(res, () => res(null), { timeout: 8000 })
        : res(null),
    );
    const { error } = await supabase
      .from('work_order_techs')
      .update({
        arrived_at: new Date().toISOString(),
        arrival_lat: pos?.coords.latitude ?? null,
        arrival_lng: pos?.coords.longitude ?? null,
      })
      .eq('work_order_id', id!)
      .eq('tech_id', uid);
    setBusy(false);
    if (error) setMsg(error.message);
    else load();
  };

  const save = async (): Promise<boolean> => {
    setBusy(true);
    setMsg('');
    const { data, error } = await supabase
      .from('site_reports')
      .upsert({ work_order_id: id!, ...r }, { onConflict: 'work_order_id' })
      .select('id')
      .single();
    if (error || !data) {
      setMsg(error?.message ?? 'حصل خطأ');
      setBusy(false);
      return false;
    }
    const fresh = creds.filter((c) => !c.id && (c.ip_address || c.username || c.password));
    if (fresh.length) {
      const { error: e2 } = await supabase
        .from('report_credentials')
        .insert(fresh.map((c) => ({ kind: c.kind, label: c.label, ip_address: c.ip_address, username: c.username, password: c.password, report_id: data.id })));
      if (e2) {
        setMsg(e2.message);
        setBusy(false);
        return false;
      }
    }
    setBusy(false);
    setMsg('تم الحفظ ✓');
    await load();
    return true;
  };

  const depart = async () => {
    if (!(await save())) return;
    const { error } = await supabase
      .from('work_order_techs')
      .update({ departed_at: new Date().toISOString() })
      .eq('work_order_id', id!)
      .eq('tech_id', uid);
    if (!error) await supabase.rpc('finish_order', { wo: id!, followup: r.needs_followup });
    load();
  };

  const num = (k: 'modules_count' | 'cameras_count' | 'intercoms_count' | 'cable_length_m') => (
    <input type="number" min={0} step="any" className={inp} value={r[k]} onChange={(e) => setR({ ...r, [k]: Number(e.target.value) })} />
  );
  const setCred = (i: number, k: keyof Cred, v: string) =>
    setCreds(creds.map((c, j) => (j === i ? { ...c, [k]: v } : c)));

  if (!o) return <p className="text-white/60">جاري التحميل...</p>;

  return (
    <div className="space-y-4">
      <div className={card + ' space-y-2'}>
        <div className="flex justify-between">
          <b>
            #{o.order_no} · {o.client_name}
          </b>
          <Badge s={o.status} />
        </div>
        <div className="text-sm text-white/70">{fmt(o.scheduled_at)}</div>
        <div className="text-sm text-white/70">{o.location_text}</div>
        {o.details && <p className="whitespace-pre-wrap text-sm">{o.details}</p>}
        <div className="flex gap-2 pt-1">
          <a href={`tel:${o.client_phone}`} className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-navy-600 py-2 text-sm">
            <Phone size={16} /> اتصال بالعميل
          </a>
          {o.location_url && (
            <a href={o.location_url} target="_blank" rel="noreferrer" className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-navy-600 py-2 text-sm">
              <MapPin size={16} /> الموقع
            </a>
          )}
        </div>
      </div>

      {me && !me.arrived_at && (
        <button disabled={busy} onClick={arrive} className={btn + ' flex w-full items-center justify-center gap-2 py-4 text-lg'}>
          <LogIn /> وصلت
        </button>
      )}
      {me?.arrived_at && <p className="text-sm text-brand">وقت الوصول: {fmt(me.arrived_at)}</p>}
      {me?.departed_at && <p className="text-sm text-brand">وقت الانصراف: {fmt(me.departed_at)}</p>}

      {me?.arrived_at && (
        <div className={card + ' space-y-3'}>
          <h2 className="font-bold">تقرير الموقع</h2>
          <L t="اللي اتعمل في الموقع">
            <textarea rows={3} className={inp} value={r.work_done} onChange={(e) => setR({ ...r, work_done: e.target.value })} />
          </L>
          <div className="grid grid-cols-2 gap-3">
            <L t="عدد المديولات">{num('modules_count')}</L>
            <L t="عدد الكاميرات">{num('cameras_count')}</L>
            <L t="عدد الانتركم">{num('intercoms_count')}</L>
            <L t="السلك (متر)">{num('cable_length_m')}</L>
          </div>

          <div className="space-y-2">
            <span className="text-sm text-white/70">باسوردات و IP</span>
            {creds.map((c, i) => (
              <div key={c.id ?? i} className="grid grid-cols-2 gap-2 rounded-xl bg-navy-800 p-2">
                <select disabled={!!c.id} className={inp} value={c.kind} onChange={(e) => setCred(i, 'kind', e.target.value)}>
                  {Object.entries(kinds).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <input disabled={!!c.id} placeholder="الاسم / المكان" className={inp} value={c.label} onChange={(e) => setCred(i, 'label', e.target.value)} />
                <input disabled={!!c.id} dir="ltr" placeholder="IP" className={inp} value={c.ip_address} onChange={(e) => setCred(i, 'ip_address', e.target.value)} />
                <input disabled={!!c.id} dir="ltr" placeholder="اليوزر" className={inp} value={c.username} onChange={(e) => setCred(i, 'username', e.target.value)} />
                <input disabled={!!c.id} dir="ltr" placeholder="الباسورد" className={inp + ' col-span-2'} value={c.password} onChange={(e) => setCred(i, 'password', e.target.value)} />
              </div>
            ))}
            <button type="button" onClick={() => setCreds([...creds, { kind: 'camera', label: '', ip_address: '', username: '', password: '' }])} className="flex items-center gap-1 text-sm text-brand">
              <Plus size={16} /> إضافة
            </button>
          </div>

          <L t="رأي العميل">
            <textarea rows={2} className={inp} value={r.client_feedback} onChange={(e) => setR({ ...r, client_feedback: e.target.value })} />
          </L>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={r.needs_followup} onChange={(e) => setR({ ...r, needs_followup: e.target.checked })} />
            لسه في تكملة للسايت
          </label>
          {r.needs_followup && (
            <textarea rows={2} placeholder="إيه المتبقي؟" className={inp} value={r.followup_notes} onChange={(e) => setR({ ...r, followup_notes: e.target.value })} />
          )}
          {msg && <p className="text-sm text-brand">{msg}</p>}
          <div className="flex gap-2">
            <button disabled={busy} onClick={save} className="flex-1 rounded-xl border border-brand py-2.5 font-bold text-brand disabled:opacity-50">
              حفظ
            </button>
            {!me.departed_at && (
              <button disabled={busy} onClick={depart} className={btn + ' flex flex-1 items-center justify-center gap-1'}>
                <LogOut size={16} /> انصراف
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
