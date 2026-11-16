import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { supabase } from '../lib/supabase';

export default function SignaturePad({ orderId, onSaved }: { orderId: string; onSaved: (path: string) => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const clear = () => {
    const c = cv.current!.getContext('2d')!;
    c.fillStyle = '#fff';
    c.fillRect(0, 0, cv.current!.width, cv.current!.height);
    setDirty(false);
  };
  useEffect(clear, []);

  const pos = (e: PointerEvent) => {
    const el = cv.current!;
    const r = el.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * el.width) / r.width, y: ((e.clientY - r.top) * el.height) / r.height };
  };
  const down = (e: PointerEvent) => {
    drawing.current = true;
    const c = cv.current!.getContext('2d')!;
    const p = pos(e);
    c.beginPath();
    c.moveTo(p.x, p.y);
    cv.current!.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (!drawing.current) return;
    const c = cv.current!.getContext('2d')!;
    c.lineWidth = 3;
    c.lineCap = 'round';
    c.strokeStyle = '#000';
    const p = pos(e);
    c.lineTo(p.x, p.y);
    c.stroke();
    setDirty(true);
  };

  const save = () => {
    setBusy(true);
    cv.current!.toBlob(async (blob) => {
      if (!blob) return setBusy(false);
      const path = `${orderId}/sig-${Date.now()}.png`;
      const { error } = await supabase.storage.from('work-files').upload(path, blob, { contentType: 'image/png' });
      setBusy(false);
      if (error) return setMsg(error.message);
      setMsg('تم أخذ التوقيع ✓ (اضغط حفظ التقرير)');
      onSaved(path);
    }, 'image/png');
  };

  return (
    <div className="space-y-2">
      <canvas ref={cv} width={600} height={220} style={{ touchAction: 'none' }} className="w-full rounded-xl bg-white"
        onPointerDown={down} onPointerMove={move} onPointerUp={() => (drawing.current = false)} />
      <div className="flex gap-2">
        <button type="button" onClick={clear} className="flex-1 rounded-xl border border-navy-600 py-2 text-sm">مسح</button>
        <button type="button" disabled={!dirty || busy} onClick={save} className="flex-1 rounded-xl bg-brand py-2 text-sm font-bold text-navy-950 disabled:opacity-50">
          {busy ? 'جاري...' : 'اعتماد التوقيع'}
        </button>
      </div>
      {msg && <p className="text-sm text-brand">{msg}</p>}
    </div>
  );
}
