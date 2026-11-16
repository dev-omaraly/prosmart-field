import type { ReactNode } from 'react';

export const inp =
  'w-full rounded-xl border border-navy-600 bg-navy-900 px-3 py-2.5 outline-none focus:border-brand';
export const btn =
  'rounded-xl bg-brand px-4 py-2.5 font-bold text-navy-950 active:bg-brand-dark disabled:opacity-50';
export const card = 'rounded-2xl border border-navy-700 bg-navy-900 p-4';

export const statusLabel: Record<string, string> = {
  new: 'جديد',
  in_progress: 'جاري',
  completed: 'مكتمل',
  followup_needed: 'متابعة مطلوبة',
  cancelled: 'ملغي',
};

export function Badge({ s }: { s: string }) {
  return (
    <span className="rounded-full bg-brand/15 px-2.5 py-0.5 text-xs text-brand">
      {statusLabel[s] ?? s}
    </span>
  );
}

export function L({ t, children }: { t: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm text-white/70">{t}</span>
      {children}
    </label>
  );
}

export const fmt = (d: string) =>
  new Date(d).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
