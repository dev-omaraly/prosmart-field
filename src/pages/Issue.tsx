import { useCallback, useEffect, useState } from 'react';
import { ScanBarcode, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import Scanner from '../components/Scanner';
import { btn, card, inp } from '../ui';

interface Bal { product_id: string; name: string; model: string | null; barcode: string | null; balance: number }
interface Ord { id: string; order_no: number; client_name: string; status: string }
interface Line { pid: string; name: string; qty: number; items: { id: string; sn: string }[] }
interface Out { quantity: number; products: { name: string } | null; stock_items: { serial_number: string } | null }

// Issue stock to a work order (storekeeper / admin).
export default function Issue() {
  const [orders, setOrders] = useState<Ord[]>([]);
  const [stock, setStock] = useState<Bal[]>([]);
  const [orderId, setOrderId] = useState('');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Bal | null>(null);
  const [tracked, setTracked] = useState(false);
  const [free, setFree] = useState<{ id: string; sn: string }[]>([]);
  const [selSn, setSelSn] = useState<string[]>([]);
  const [qty, setQty] = useState(1);
  const [cart, setCart] = useState<Line[]>([]);
  const [issued, setIssued] = useState<Out[]>([]);
  const [scan, setScan] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const loadStock = useCallback(async () => {
    const { data } = await supabase.from('stock_balance').select('product_id,name,model,barcode,balance').order('name');
    setStock((data ?? []) as Bal[]);
  }, []);
  useEffect(() => {
    supabase.from('work_orders').select('id,order_no,client_name,status').not('status', 'in', '(cancelled)').order('scheduled_at', { ascending: false }).limit(60)
      .then(({ data }) => setOrders((data ?? []) as Ord[]));
    loadStock();
  }, [loadStock]);

  const loadIssued = useCallback(async () => {
    if (!orderId) return setIssued([]);
    const { data } = await supabase.from('stock_movements').select('quantity,products(name),stock_items(serial_number)').eq('work_order_id', orderId).eq('type', 'out');
    setIssued((data ?? []) as unknown as Out[]);
  }, [orderId]);
  useEffect(() => {
    loadIssued();
  }, [loadIssued]);

  const pick = async (b: Bal) => {
    setPicked(b); setQty(1); setSelSn([]); setErr('');
    const { data: p } = await supabase.from('products').select('track_serial').eq('id', b.product_id).single();
    const ts = !!p?.track_serial;
    setTracked(ts);
    if (ts) {
      const [{ data: items }, { data: outs }] = await Promise.all([
        supabase.from('stock_items').select('id,serial_number').eq('product_id', b.product_id),
        supabase.from('stock_movements').select('stock_item_id').eq('product_id', b.product_id).eq('type', 'out'),
      ]);
      const gone = new Set((outs ?? []).map((o) => o.stock_item_id));
      setFree((items ?? []).filter((i) => !gone.has(i.id)).map((i) => ({ id: i.id, sn: i.serial_number })));
    }
  };

  const onScan = (v: string) => {
    setScan(false);
    const hit = stock.find((s) => s.barcode === v);
    if (hit) pick(hit);
    else setErr('الباركود ده مش موجود في المخزن');
  };

  const addLine = () => {
    if (!picked) return;
    setErr('');
    if (tracked) {
      if (!selSn.length) return setErr('اختار سيريال واحد على الأقل');
      const items = free.filter((f) => selSn.includes(f.id));
      setCart([...cart.filter((c) => c.pid !== picked.product_id), { pid: picked.product_id, name: picked.name, qty: items.length, items }]);
    } else {
      const already = cart.find((c) => c.pid === picked.product_id)?.qty ?? 0;
      if (qty <= 0) return setErr('الكمية غلط');
      if (qty + already > Number(picked.balance)) return setErr(`الرصيد المتاح ${Number(picked.balance)} بس`);
      setCart([...cart.filter((c) => c.pid !== picked.product_id), { pid: picked.product_id, name: picked.name, qty: qty + already, items: [] }]);
    }
    setPicked(null); setQ('');
  };

  const submit = async () => {
    if (!orderId) return setErr('اختار أمر الشغل الأول');
    if (!cart.length) return setErr('مفيش أصناف في القائمة');
    setBusy(true); setErr(''); setMsg('');
    for (const l of cart) {
      const rows = l.items.length
        ? l.items.map((i) => ({ product_id: l.pid, stock_item_id: i.id, type: 'out', quantity: 1, work_order_id: orderId }))
        : [{ product_id: l.pid, type: 'out', quantity: l.qty, work_order_id: orderId }];
      const { error } = await supabase.from('stock_movements').insert(rows);
      if (error) {
        setBusy(false);
        return setErr(`${l.name}: ${error.message}`);
      }
    }
    setBusy(false);
    setCart([]);
    setMsg('تم الصرف على الأمر ✓');
    loadStock();
    loadIssued();
  };

  const shown = q.trim() ? stock.filter((r) => (r.name + (r.model ?? '') + (r.barcode ?? '')).toLowerCase().includes(q.toLowerCase())).slice(0, 8) : [];

  return (
    <div className="space-y-4">
      {scan && <Scanner onResult={onScan} onClose={() => setScan(false)} />}
      <h1 className="text-xl font-bold">صرف من المخزن لأمر شغل</h1>
      <select className={inp} value={orderId} onChange={(e) => { setOrderId(e.target.value); setMsg(''); }}>
        <option value="">اختار أمر الشغل...</option>
        {orders.map((o) => (<option key={o.id} value={o.id}>#{o.order_no} · {o.client_name}</option>))}
      </select>

      <div className={card + ' space-y-2'}>
        <div className="flex gap-2">
          <input className={inp} placeholder="ابحث بالاسم أو الموديل أو الباركود" value={q} onChange={(e) => setQ(e.target.value)} />
          <button type="button" onClick={() => setScan(true)} className="rounded-xl border border-brand px-3 text-brand"><ScanBarcode /></button>
        </div>
        {shown.map((r) => (
          <button key={r.product_id} onClick={() => pick(r)} className="flex w-full items-center justify-between rounded-xl bg-navy-800 px-3 py-2 text-start">
            <span>{r.name} <span className="text-xs text-white/50" dir="ltr">{r.model}</span></span>
            <b className="text-brand">{Number(r.balance)}</b>
          </button>
        ))}
        {picked && (
          <div className="space-y-2 rounded-xl border border-brand/50 p-3">
            <div className="flex justify-between"><b>{picked.name}</b><span className="text-sm text-white/60">الرصيد: {Number(picked.balance)}</span></div>
            {tracked ? (
              <div className="max-h-40 space-y-1 overflow-auto">
                {free.map((f) => (
                  <label key={f.id} className="flex items-center gap-2 rounded-lg bg-navy-800 px-3 py-1.5 text-sm" dir="ltr">
                    <input type="checkbox" checked={selSn.includes(f.id)} onChange={() => setSelSn(selSn.includes(f.id) ? selSn.filter((x) => x !== f.id) : [...selSn, f.id])} />
                    {f.sn}
                  </label>
                ))}
                {!free.length && <p className="text-sm text-white/50">مفيش سيريالات متاحة.</p>}
              </div>
            ) : (
              <input type="number" min={1} step="any" className={inp} value={qty} onChange={(e) => setQty(Number(e.target.value))} />
            )}
            <button onClick={addLine} className={btn + ' w-full'}>إضافة للقائمة</button>
          </div>
        )}
      </div>

      {cart.length > 0 && (
        <div className={card + ' space-y-2'}>
          <h2 className="font-bold">هيتصرف دلوقتي</h2>
          {cart.map((l) => (
            <div key={l.pid} className="flex items-center justify-between rounded-xl bg-navy-800 px-3 py-2 text-sm">
              <span>{l.name} × {l.qty}{l.items.length ? <span className="text-xs text-white/50" dir="ltr"> ({l.items.map((i) => i.sn).join(', ')})</span> : null}</span>
              <button onClick={() => setCart(cart.filter((c) => c.pid !== l.pid))} className="text-red-300"><X size={16} /></button>
            </div>
          ))}
          <button disabled={busy} onClick={submit} className={btn + ' w-full'}>{busy ? 'جاري الصرف...' : 'تأكيد الصرف'}</button>
        </div>
      )}
      {err && <p className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200">{err}</p>}
      {msg && <p className="text-sm text-brand">{msg}</p>}

      {orderId && issued.length > 0 && (
        <div className={card + ' space-y-1'}>
          <h2 className="font-bold">اللي اتصرف قبل كده على الأمر</h2>
          {issued.map((o, i) => (<div key={i} className="text-sm text-white/80">{o.products?.name} × {Number(o.quantity)}{o.stock_items ? ` — SN: ${o.stock_items.serial_number}` : ''}</div>))}
        </div>
      )}
    </div>
  );
}
