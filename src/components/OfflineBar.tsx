import { useCallback, useEffect, useState } from 'react';
import { CloudOff, RefreshCw, TriangleAlert } from 'lucide-react';
import { clearFailed, failedItems, flush, isOnline, pendingCount, type FailedItem } from '../lib/offline';

// Thin status strip under the header: offline / syncing / failed items.
export default function OfflineBar() {
  const [on, setOn] = useState(isOnline());
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState<FailedItem[]>([]);
  const [show, setShow] = useState(false);

  const refresh = useCallback(async () => {
    setOn(isOnline());
    setPending(await pendingCount());
    setFailed(await failedItems());
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener('prosmart:net', refresh);
    const t = setInterval(refresh, 5000);
    return () => {
      window.removeEventListener('prosmart:net', refresh);
      clearInterval(t);
    };
  }, [refresh]);

  if (on && !pending && !failed.length) return null;

  return (
    <div className="space-y-1">
      {(!on || pending > 0) && (
        <div className={`flex items-center gap-2 px-4 py-2 text-xs ${on ? 'bg-brand/20 text-brand' : 'bg-amber-500/20 text-amber-200'}`}>
          {on ? <RefreshCw size={14} className="animate-spin" /> : <CloudOff size={14} />}
          <span className="flex-1">
            {on
              ? `جاري رفع ${pending} تغيير...`
              : `مفيش نت — شغال على آخر بيانات محفوظة${pending ? ` · ${pending} تغيير هيترفع أول ما النت يرجع` : ''}`}
          </span>
          {on && pending > 0 && (
            <button onClick={() => flush()} className="rounded-md border border-brand/50 px-2 py-0.5">
              جرّب دلوقتي
            </button>
          )}
        </div>
      )}
      {failed.length > 0 && (
        <div className="bg-red-500/15 px-4 py-2 text-xs text-red-200">
          <button className="flex w-full items-center gap-2 text-start" onClick={() => setShow(!show)}>
            <TriangleAlert size={14} />
            <span className="flex-1">{failed.length} عملية ماترفعتش (السيرفر رفضها)</span>
            <span>{show ? '▲' : '▼'}</span>
          </button>
          {show && (
            <div className="mt-2 space-y-1">
              {failed.map((f, i) => (
                <p key={i} dir="ltr" className="break-all rounded bg-black/20 p-1.5 text-[11px]">
                  {f.method} {f.url.slice(0, 80)} → {f.status} {f.msg}
                </p>
              ))}
              <button onClick={() => clearFailed()} className="rounded-md border border-red-300/50 px-2 py-1">
                تجاهل ومسح
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
