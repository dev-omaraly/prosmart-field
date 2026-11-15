import { Hammer } from 'lucide-react';

export default function Placeholder({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">{title}</h1>
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-navy-700 bg-navy-900 p-8 text-center">
        <Hammer className="text-brand" size={32} />
        <p className="text-white/70">{hint ?? 'الشاشة دي هتتبنى في الخطوات الجاية.'}</p>
      </div>
    </div>
  );
}
