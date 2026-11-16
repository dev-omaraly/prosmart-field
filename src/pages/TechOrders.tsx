import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Badge, card, fmt } from '../ui';

interface Order {
  id: string;
  order_no: number;
  client_name: string;
  location_text: string;
  scheduled_at: string;
  status: string;
}

export default function TechOrders() {
  const [rows, setRows] = useState<Order[]>([]);
  useEffect(() => {
    supabase
      .from('work_orders')
      .select('id,order_no,client_name,location_text,scheduled_at,status')
      .order('scheduled_at', { ascending: false })
      .then(({ data }) => setRows((data ?? []) as Order[]));
  }, []);

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">أوامر الشغل بتاعتي</h1>
      <div className="space-y-3">
        {rows.map((r) => (
          <Link key={r.id} to={`/tech/${r.id}`} className={card + ' block active:bg-navy-700'}>
            <div className="flex justify-between">
              <b>
                #{r.order_no} · {r.client_name}
              </b>
              <Badge s={r.status} />
            </div>
            <div className="mt-1 text-sm text-white/60">{r.location_text}</div>
            <div className="text-sm text-white/60">{fmt(r.scheduled_at)}</div>
          </Link>
        ))}
        {!rows.length && <p className="text-white/50">مفيش أوامر شغل ليك دلوقتي.</p>}
      </div>
    </div>
  );
}
