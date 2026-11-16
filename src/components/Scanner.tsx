import { useEffect, useRef, useState } from 'react';

export default function Scanner({ onResult, onClose }: { onResult: (v: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let stream: MediaStream | undefined;
    let stop = false;
    (async () => {
      try {
        const BD = (window as any).BarcodeDetector;
        if (!BD) {
          setErr('الكاميرا مش بتدعم قراءة الباركود هنا، اكتبه يدوي.');
          return;
        }
        const det = new BD({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code', 'data_matrix'],
        });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        const v = ref.current!;
        v.srcObject = stream;
        await v.play();
        const tick = async () => {
          if (stop) return;
          try {
            const found = await det.detect(v);
            if (found.length) {
              onResult(found[0].rawValue);
              return;
            }
          } catch {
            /* keep scanning */
          }
          setTimeout(tick, 250);
        };
        tick();
      } catch {
        setErr('مقدرتش أفتح الكاميرا، تأكد من صلاحية الكاميرا.');
      }
    })();
    return () => {
      stop = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <video ref={ref} playsInline muted className="min-h-0 flex-1 object-cover" />
      {err && <p className="bg-red-500/30 p-3 text-center text-sm">{err}</p>}
      <button onClick={onClose} className="m-4 rounded-xl bg-white/15 py-3">
        إغلاق
      </button>
    </div>
  );
}
