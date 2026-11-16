import { useEffect, useState } from 'react';
import { useAuth } from '../auth';
import { supabase } from '../lib/supabase';
import { roleLabel, type Profile, type Role } from '../types';
import { L, btn, card, inp } from '../ui';

export default function Settings() {
  const { profile, session } = useAuth();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState('');

  const saveProfile = async () => {
    const { error } = await supabase.from('profiles').update({ full_name: name, phone: phone || null }).eq('id', session!.user.id);
    setMsg(error ? error.message : 'تم حفظ البيانات ✓ (الاسم هيتحدث بعد إعادة فتح التطبيق)');
  };
  const savePw = async () => {
    if (pw.length < 6) return setMsg('الباسورد لازم 6 حروف على الأقل');
    const { error } = await supabase.auth.updateUser({ password: pw });
    setMsg(error ? error.message : 'تم تغيير الباسورد ✓');
    setPw('');
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">الإعدادات</h1>
      <div className={card + ' space-y-3'}>
        <h2 className="font-bold">بياناتي</h2>
        <L t="الاسم"><input className={inp} value={name} onChange={(e) => setName(e.target.value)} /></L>
        <L t="رقم التليفون"><input dir="ltr" className={inp} value={phone} onChange={(e) => setPhone(e.target.value)} /></L>
        <button onClick={saveProfile} className={btn + ' w-full'}>حفظ</button>
      </div>
      <div className={card + ' space-y-3'}>
        <h2 className="font-bold">تغيير الباسورد</h2>
        <input type="password" dir="ltr" placeholder="الباسورد الجديد" className={inp} value={pw} onChange={(e) => setPw(e.target.value)} />
        <button onClick={savePw} className={btn + ' w-full'}>تغيير</button>
      </div>
      {msg && <p className="text-sm text-brand">{msg}</p>}
      {profile?.role === 'admin' && <Users />}
    </div>
  );
}

function Users() {
  const [rows, setRows] = useState<Profile[]>([]);
  const load = () => supabase.from('profiles').select('*').order('full_name').then(({ data }) => setRows((data ?? []) as Profile[]));
  useEffect(() => {
    load();
  }, []);
  const upd = async (id: string, patch: Partial<Profile>) => {
    await supabase.from('profiles').update(patch).eq('id', id);
    load();
  };
  return (
    <div className={card + ' space-y-2'}>
      <h2 className="font-bold">المستخدمين والصلاحيات</h2>
      {rows.map((u) => (
        <div key={u.id} className="flex items-center justify-between gap-2 rounded-xl bg-navy-800 p-2 text-sm">
          <span>{u.full_name || 'بدون اسم'}</span>
          <div className="flex items-center gap-2">
            <select className="rounded-lg border border-navy-600 bg-navy-900 px-2 py-1" value={u.role} onChange={(e) => upd(u.id, { role: e.target.value as Role })}>
              {(Object.keys(roleLabel) as Role[]).map((r) => (<option key={r} value={r}>{roleLabel[r]}</option>))}
            </select>
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={u.is_active} onChange={(e) => upd(u.id, { is_active: e.target.checked })} />نشط</label>
          </div>
        </div>
      ))}
    </div>
  );
}
