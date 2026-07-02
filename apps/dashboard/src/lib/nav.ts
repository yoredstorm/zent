import {
  LayoutDashboard,
  Package,
  FolderTree,
  FileText,
  Warehouse,
  Users,
  ShoppingCart,
  BarChart3,
  MessageCircle,
  Settings,
} from 'lucide-react';

export type Role = 'ADMIN' | 'VENDEDOR' | 'AGENTE';

export const navItems = [
  { href: '/dashboard', label: 'Inicio', icon: LayoutDashboard, roles: ['ADMIN', 'VENDEDOR'] as Role[] },
  { href: '/dashboard/products', label: 'Productos', icon: Package, roles: ['ADMIN', 'VENDEDOR'] as Role[] },
  { href: '/dashboard/categories', label: 'Categorias', icon: FolderTree, roles: ['ADMIN', 'VENDEDOR'] as Role[] },
  { href: '/dashboard/catalog', label: 'Catalogo PDF', icon: FileText, roles: ['ADMIN', 'VENDEDOR'] as Role[] },
  { href: '/dashboard/inventory', label: 'Inventario', icon: Warehouse, roles: ['ADMIN', 'VENDEDOR'] as Role[] },
  { href: '/dashboard/customers', label: 'Clientes', icon: Users, roles: ['ADMIN', 'VENDEDOR'] as Role[] },
  { href: '/dashboard/orders', label: 'Pedidos', icon: ShoppingCart, roles: ['ADMIN', 'VENDEDOR', 'AGENTE'] as Role[] },
  { href: '/dashboard/reports', label: 'Reportes', icon: BarChart3, roles: ['ADMIN', 'VENDEDOR'] as Role[] },
  { href: '/dashboard/whatsapp', label: 'WhatsApp', icon: MessageCircle, roles: ['ADMIN', 'VENDEDOR', 'AGENTE'] as Role[] },
  { href: '/dashboard/settings/store', label: 'Configuracion', icon: Settings, roles: ['ADMIN'] as Role[] },
];

export const settingsTabs = [
  { href: '/dashboard/settings/store', label: 'Tienda' },
  { href: '/dashboard/settings/users', label: 'Equipo' },
];

export function navForRole(role: Role) {
  return navItems.filter((item) => item.roles.includes(role));
}

export const roleLabels: Record<Role, string> = {
  ADMIN: 'Administrador',
  VENDEDOR: 'Vendedor',
  AGENTE: 'Agente',
};

export function roleBadgeTone(role: Role): 'brand' | 'default' | 'warning' {
  if (role === 'ADMIN') return 'brand';
  if (role === 'AGENTE') return 'warning';
  return 'default';
}
