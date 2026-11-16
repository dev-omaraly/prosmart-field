import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { Camera } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function Photos({ orderId }: { orderId: string }) {
  const [urls, setUrls] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('work_order_photos')
      .select('storage_path')
      .eq('work_order_id', orderId)
      .order('created_at');
    const paths = (data ?? []).map((p) => p.storage_path as string);
    if (!paths.length) return setUrls([]);
    const { data: s } = await supabase.storage.from('work-files').createSignedUrls(paths, 3600);
    setUrls((s ?? []).map((x) => x.signedUrl).filter(Boolean) as string[]);
  }, [orderId]);
  useEffect(() => {
    load();
  }, [load]);

  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setBusy(true);
    setErr('');
    for (const f of files) {
      const ext = (f.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${orderId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('work-files').upload(path, f, { contentType: f.type });
      if (error) {
        setErr(error.message);
        break;
      }
      await supabase.from('work_order_photos').insert({ work_order_id: orderId, storage_path: path });
    }
    e.target.value = '';
    setBusy(false);
    load();
  };

  return (
    <div className="space-y-2">
      {urls.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {urls.map((u) => (
            <a key={u} href={u} target="_blank" rel="noreferrer">
              <img src={u} loading="lazy" className="aspect-square w-full rounded-lg object-cover" />
            </a>
          ))}
        </div>
      )}
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-brand/60 py-2.5 text-sm text-brand">
        <Camera size={18} />
        {busy ? 'جاري الرفع...' : 'إضافة صور'}
        <input type="file" accept="image/*" multiple hidden disabled={busy} onChange={upload} />
      </label>
      {err && <p className="text-sm text-red-200">{err}</p>}
    </div>
  );
}
