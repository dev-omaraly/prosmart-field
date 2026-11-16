import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Plus, ScanBarcode } from 'lucide-react';
import { supabase } from '../lib/supabase';
import Scanner from '../components/Scanner';
import { L, btn, card, inp } from '../ui';

interface Bal {
  product_id: string;
  name: string;
  model: string | null;
  barcode: string | null;
  min_stock: number;
  balance: number;
}

export default function Stock() {
  const [rows, setRows] = useState<Bal[]>([]);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase.from('stock_balance').select('*').order('name');
    setRows((data ?? []) as Bal[]);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const shown = rows.filter((r) =>
    (r.name + (r.model ?? '') + (r.barcode ?? '')).toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">المخزن</h1>
        <button className={btn + ' flex items-center gap-1'} onClick={() => setOpen(!open)}>
          <Plus size={16} />
          استلام بضاعة
        </button>
      </div>
      {open && (
        <Receive
          onDone={() => {
            setOpen(false);
            load();
          }}
        />
      )}
      <input className={inp + ' mb-3'} placeholder="بحث بالاسم أو الموديل أو الباركود" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="space-y-2">
        {shown.map((r) => (
          <div key={r.product_id} className={card + ' flex items-center justify-between'}>
            <div>
              <b>{r.name}</b>
              <div className="text-xs text-white/60" dir="ltr">
                {[r.model, r.barcode].filter(Boolean).join(' · ')}
              </div>
            </div>
            <span className={`rounded-lg px-3 py-1 font-bold ${Number(r.balance) <= Number(r.min_stock) ? 'bg-red-500/20 text-red-200' : 'bg-brand/15 text-brand'}`}>
              {Number(r.balance)}
            </span>
          </div>
        ))}
        {!shown.length && <p className="text-white/50">مفيش منتجات.</p>}
      </div>
    </div>
  );
}

const blank = { barcode: '', name: '', brand: '', model: '', category: '', track_serial: false, qty: 1, serials: '' };

function Receive({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState(blank);
  const [scan, setScan] = useState<'barcode' | 'serial' | null>(null);
  const [known, setKnown] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const lookup = async (code: string) => {
    if (!code) return;
    const { data } = await supabase.from('products').select('*').eq('barcode', code).maybeSingle();
    if (data) {
      setKnown(data.id);
      setF((x) => ({ ...x, barcode: code, name: data.name, brand: data.brand ?? '', model: data.model ?? '', category: data.category ?? '', track_serial: data.track_serial }));
    } else {
      setKnown(null);
      setF((x) => ({ ...x, barcode: code }));
    }
  };

  const onScan = (v: string) => {
    if (scan === 'barcode') lookup(v);
    else setF((x) => ({ ...x, serials: (x.serials ? x.serials + '\n' : '') + v }));
    setScan(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    let pid = known;
    if (!pid) {
      const { data, error } = await supabase
        .from('products')
        .insert({ name: f.name, brand: f.brand || null, model: f.model || null, category: f.category || null, barcode: f.barcode || null, track_serial: f.track_serial })
        .select('id')
        .single();
      if (error || !data) {
        setErr(error?.message ?? 'حصل خطأ');
        setBusy(false);
        return;
      }
      pid = data.id;
    }
    if (f.track_serial) {
      const list = [...new Set(f.serials.split('\n').map((s) => s.trim()).filter(Boolean))];
      if (!list.length) {
        setErr('اكتب أو امسح سيريال واحد على الأقل');
        setBusy(false);
        return;
      }
      for (const sn of list) {
        const { data: it, error: e1 } = await supabase.from('stock_items').insert({ product_id: pid, serial_number: sn }).select('id').single();
        if (e1 || !it) {
          setErr(`السيريال ${sn}: ${e1?.message}`);
          setBusy(false);
          return;
        }
        await supabase.from('stock_movements').insert({ product_id: pid, stock_item_id: it.id, type: 'in', quantity: 1 });
      }
    } else {
      await supabase.from('stock_movements').insert({ product_id: pid, type: 'in', quantity: f.qty });
    }
    setBusy(false);
    onDone();
  };

  return (
    <form onSubmit={submit} className={card + ' mb-4 space-y-3'}>
      {scan && <Scanner onResult={onScan} onClose={() => setScan(null)} />}
      <L t="الباركود">
        <div className="flex gap-2">
          <input dir="ltr" className={inp} value={f.barcode} onChange={set('barcode')} onBlur={() => lookup(f.barcode)} />
          <button type="button" onClick={() => setScan('barcode')} className="rounded-xl border border-brand px-3 text-brand">
            <ScanBarcode />
          </button>
        </div>
      </L>
      {known && <p className="text-sm text-brand">منتج موجود، هتزود على رصيده.</p>}
      <L t="اسم المنتج">
        <input required readOnly={!!known} className={inp} value={f.name} onChange={set('name')} />
      </L>
      <div className="grid grid-cols-2 gap-3">
        <L t="الماركة">
          <input readOnly={!!known} className={inp} value={f.brand} onChange={set('brand')} />
        </L>
        <L t="الموديل">
          <input readOnly={!!known} dir="ltr" className={inp} value={f.model} onChange={set('model')} />
        </L>
      </div>
      <L t="الفئة (كاميرا، انتركم، شبكات...)">
        <input readOnly={!!known} className={inp} value={f.category} onChange={set('category')} />
      </L>
      {!known && (
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={f.track_serial} onChange={(e) => setF({ ...f, track_serial: e.target.checked })} />
          له سيريال نمبر (كل قطعة بسيريال)
        </label>
      )}
      {f.track_serial ? (
        <L t="السيريالات (واحد في كل سطر)">
          <textarea rows={4} dir="ltr" className={inp} value={f.serials} onChange={set('serials')} />
          <button type="button" onClick={() => setScan('serial')} className="mt-1 flex items-center gap-1 text-sm text-brand">
            <ScanBarcode size={16} /> مسح سيريال
          </button>
        </L>
      ) : (
        <L t="الكمية">
          <input type="number" min={1} step="any" className={inp} value={f.qty} onChange={(e) => setF({ ...f, qty: Number(e.target.value) })} />
        </L>
      )}
      {err && <p className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200">{err}</p>}
      <button disabled={busy} className={btn + ' w-full'}>
        {busy ? 'جاري الحفظ...' : 'حفظ في المخزن'}
      </button>
    </form>
  );
}
