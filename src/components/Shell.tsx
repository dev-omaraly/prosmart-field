import { NavLink, Outlet } from 'react-router-dom';
import { LogOut, type LucideIcon } from 'lucide-react';
import { useAuth } from '../auth';
import { roleLabel } from '../types';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export default function Shell({ nav }: { nav: NavItem[] }) {
  const { profile, signOut } = useAuth();

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-navy-700 bg-navy-900/95 px-4 py-3 backdrop-blur">
        <div>
          <div className="text-lg font-bold tracking-widest text-brand">PROSMART</div>
          <div className="text-xs text-white/60">
            {profile?.full_name || 'مستخدم'} · {profile ? roleLabel[profile.role] : ''}
          </div>
        </div>
        <button
          onClick={signOut}
          className="flex items-center gap-1 rounded-lg border border-navy-600 px-3 py-2 text-sm text-white/80 active:bg-navy-700"
        >
          <LogOut size={16} />
          خروج
        </button>
      </header>

      <main className="flex-1 px-4 pb-28 pt-4">
        <Outlet />
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-10 border-t border-navy-700 bg-navy-900/95 backdrop-blur"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="mx-auto flex max-w-3xl">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-1 py-2.5 text-xs ${
                  isActive ? 'text-brand' : 'text-white/60'
                }`
              }
            >
              <Icon size={22} />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
