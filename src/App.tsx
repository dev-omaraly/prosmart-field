import type { ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ClipboardList, FileText, Package, Users, Wrench } from 'lucide-react';
import { useAuth } from './auth';
import { homePath, type Role } from './types';
import Shell, { type NavItem } from './components/Shell';
import Login from './pages/Login';
import Placeholder from './pages/Placeholder';
import Stock from './pages/Stock';
import Orders from './pages/admin/Orders';
import TechOrders from './pages/TechOrders';
import TechOrder from './pages/TechOrder';

const adminNav: NavItem[] = [
  { to: '/admin', label: 'أوامر الشغل', icon: ClipboardList, end: true },
  { to: '/admin/stock', label: 'المخزن', icon: Package },
  { to: '/admin/team', label: 'الفريق', icon: Users },
  { to: '/admin/reports', label: 'التقارير', icon: FileText },
];
const techNav: NavItem[] = [{ to: '/tech', label: 'أوامري', icon: Wrench, end: true }];
const storeNav: NavItem[] = [
  { to: '/store', label: 'المنتجات', icon: Package, end: true },
];

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center text-white/70">جاري التحميل...</div>
  );
}

function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { session, profile, loading } = useAuth();
  if (loading) return <Splash />;
  if (!session || !profile) return <Navigate to="/login" replace />;
  if (!roles.includes(profile.role)) return <Navigate to={homePath(profile.role)} replace />;
  return <>{children}</>;
}

function Home() {
  const { session, profile, loading } = useAuth();
  if (loading) return <Splash />;
  if (!session || !profile) return <Navigate to="/login" replace />;
  return <Navigate to={homePath(profile.role)} replace />;
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Home />} />

        <Route
          path="/admin"
          element={
            <RequireRole roles={['admin']}>
              <Shell nav={adminNav} />
            </RequireRole>
          }
        >
          <Route index element={<Orders />} />
          <Route path="stock" element={<Stock />} />
          <Route path="team" element={<Placeholder title="الفريق" />} />
          <Route path="reports" element={<Placeholder title="التقارير" />} />
        </Route>

        <Route
          path="/tech"
          element={
            <RequireRole roles={['technician']}>
              <Shell nav={techNav} />
            </RequireRole>
          }
        >
          <Route index element={<TechOrders />} />
          <Route path=":id" element={<TechOrder />} />
        </Route>

        <Route
          path="/store"
          element={
            <RequireRole roles={['storekeeper', 'admin']}>
              <Shell nav={storeNav} />
            </RequireRole>
          }
        >
          <Route index element={<Stock />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
