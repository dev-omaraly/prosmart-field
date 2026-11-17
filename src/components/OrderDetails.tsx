import { useEffect, useState } from 'react';
import { FileDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { esc, exportPdf } from '../lib/export';
import { fmt } from '../ui';

interface Rep {
  work_done: string | null;
  modules_count: number;
  cameras_count: number;
  intercoms_count: number;
  cable_length_m: number;
  client_feedback: string | null;
  needs_followup: boolean;
  followup_notes: string | null;
  signature_path: string | null;
}
interface Out {
  quantity: number;
  products: { name: string } | null;
  stock_items: { serial_number: string } | null;
}
export interface OrderLite {
  id: string;
  order_no: number;
  client_name: string;
  location_text: string;
  scheduled_at: string;
  status: string;
}

// Admin view of one order: site report, client signature, issued stock, PDF export.
export default function OrderDetails({ order }: { order: OrderLite }) {
  const [open, setOpen] = useState(false);
  const [rep, setRep] = useState<Rep | null>(null);
  const [sig, setSig] = useState('');
  const [out, setOut] = useState<Out[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || loaded) return;
    (async () => {
      const { data } = await supabase.from('site_reports').select('*').eq('work_order_id', order.id).maybeSingle();
      setRep((data as Rep | null) ?? null);
      if (data?.signature_path) {
        const { data: u } = await supabase.storage.from('work-files').createSignedUrl(data.signature_path, 3600);
        setSig(u?.signedUrl ?? '');
      }
      const { data: m } = await supabase
        .from('stock_movements')
        .select('quantity,products(name),stock_items(serial_number)')
        .eq('work_order_id', order.id)
        .eq('type', 'out');
      setOut((m ?? []) as unknown as Out[]);
      setLoaded(true);
    })();
  }, [open, loaded, order.id]);

  const pdf = async () => {
    setBusy(true);
    try {
      const r = rep;
      await exportPdf(`order-${order.order_no}`, `
        <h2 style="margin:0;color:#003a5f">PROSMART — تقرير أمر شغل #${order.order_no}</h2>
        <p style="color:#555;margin:2px 0 12px">${esc(order.client_name)} · ${esc(order.location_text)} · ${esc(fmt(order.scheduled_at))}</p>
        ${r ? `
          <p><b>اللي اتعمل:</b> ${esc(r.work_done)}</p>
          <p>مديولات: <b>${r.modules_count}</b> · كاميرات: <b>${r.cameras_count}</b> · انتركم: <b>${r.intercoms_count}</b> · سلك: <b>${r.cable_length_m} م</b></p>
          <p><b>رأي العميل:</b> ${esc(r.client_feedback)}</p>
          ${r.needs_followup ? `<p><b>متبقي:</b> ${esc(r.followup_notes)}</p>` : ''}` : '<p>لا يوجد تقرير موقع بعد.</p>'}
        ${out.length ? `<p><b>المصروف من المخزن:</b></p><ul>${out.map((o) => `<li>${esc(o.products?.name)} × ${Number(o.quantity)}${o.stock_items ? ' — SN: ' + esc(o.stock_items.serial_number) : ''}</li>`).join('')}</ul>` : ''}
        ${sig ? `<p><b>توقيع العميل:</b></p><img src="${sig}" crossorigin="anonymous" style="width:260px;border:1px solid #ccc" />` : ''}
      `);
    } finally { setBusy(false); }
  };

  return (
    <div className="mt-3">
      <button onClick={() => setOpen(!open)} className="text-sm text-brand">{open ? 'إخفاء التقرير ▲' : 'تقرير الموقع والتوقيع ▼'}</button>
      {open && (
        <div className="mt-2 space-y-2 rounded-xl bg-navy-800 p-3 text-sm">
          {!loaded && <p className="text-white/60">جاري التحميل...</p>}
          {loaded && !rep && <p className="text-white/60">الفني لسه ماكتبش تقرير.</p>}
          {rep && (
            <>
              {rep.work_done && <p className="whitespace-pre-wrap">{rep.work_done}</p>}
              <p className="text-white/70">مديولات {rep.modules_count} · كاميرات {rep.cameras_count} · انتركم {rep.intercoms_count} · سلك {rep.cable_length_m} م</p>
              {rep.client_feedback && <p><b>رأي العميل:</b> {rep.client_feedback}</p>}
              {rep.needs_followup && <p className="text-amber-200">متابعة مطلوبة: {rep.followup_notes}</p>}
              <div>
                <b>توقيع العميل:</b>
                {sig ? <img src={sig} className="mt-1 w-56 rounded-lg bg-white" /> : <span className="text-white/60"> لم يتم</span>}
              </div>
            </>
          )}
          {out.length > 0 && (
            <div>
              <b>المصروف من المخزن:</b>
              <ul className="list-disc pe-5 ps-5 text-white/80">
                {out.map((o, i) => (<li key={i}>{o.products?.name} × {Number(o.quantity)}{o.stock_items ? ` (SN: ${o.stock_items.serial_number})` : ''}</li>))}
              </ul>
            </div>
          )}
          {loaded && (
            <button disabled={busy} onClick={pdf} className="flex items-center gap-1 rounded-lg border border-brand px-3 py-1.5 text-brand disabled:opacity-50">
              <FileDown size={16} /> {busy ? 'جاري التجهيز...' : 'تصدير PDF للأمر'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
