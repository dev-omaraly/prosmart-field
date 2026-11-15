export type Role = 'admin' | 'technician' | 'storekeeper';

export interface Profile {
  id: string;
  full_name: string;
  phone: string | null;
  role: Role;
  is_active: boolean;
}

export const roleLabel: Record<Role, string> = {
  admin: 'إداري',
  technician: 'فني',
  storekeeper: 'أمين مخزن',
};

export const homePath = (role: Role): string =>
  role === 'admin' ? '/admin' : role === 'technician' ? '/tech' : '/store';
