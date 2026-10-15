import type { ElementType } from 'react';
import {
  BookOpen,
  ChartBar,
  ChatCircleText,
  ClipboardText,
  Database,
  Gear,
  House,
  SealQuestion,
  ShieldCheck,
  ShieldWarning,
  SquaresFour,
} from '@phosphor-icons/react';
import type { AppRole } from '@/lib/auth-store';

export interface NavItem {
  href: string;
  label: string;
  icon: ElementType;
  /** Contador opcional exibido à direita do item (ex: casos aguardando). */
  count?: number | string;
  /** Rotas cujo prefixo também ativa este item (além de `href`). */
  matchPrefixes?: string[];
  /** Ativa só na rota exata (ex.: /admin não deve acender em /admin/users). */
  exact?: boolean;
  /** Prefixos que NÃO ativam o item (ex.: /encounters/new tem item próprio). */
  excludePrefixes?: string[];
}

export interface NavSection {
  /** Rótulo da seção no sidebar (ex.: "Workspace"). Sem rótulo = topo. */
  label?: string;
  items: NavItem[];
}

const CLINICAL_ITEMS: NavItem[] = [
  { href: '/encounters', label: 'Casos', icon: ClipboardText, excludePrefixes: ['/encounters/new'] },
  { href: '/guidelines', label: 'Diretrizes', icon: BookOpen },
];

const GOVERNANCE_ITEMS: NavItem[] = [
  { href: '/audit', label: 'Auditoria', icon: ShieldCheck },
  { href: '/admin', label: 'Console', icon: SquaresFour },
];

/** Seções do sidebar clínico por papel. "Plantão" e "Novo caso" ficam no topo fixo. */
export const APP_SECTIONS_BY_ROLE: Record<AppRole, NavSection[]> = {
  physician: [{ label: 'Workspace', items: CLINICAL_ITEMS }],
  compliance: [
    { label: 'Workspace', items: CLINICAL_ITEMS },
    { label: 'Governança', items: GOVERNANCE_ITEMS },
  ],
  admin: [
    { label: 'Workspace', items: CLINICAL_ITEMS },
    { label: 'Governança', items: GOVERNANCE_ITEMS },
  ],
};

export const HOME_ITEM: NavItem = { href: '/dashboard', label: 'Plantão', icon: House };

export const SETTINGS_ITEM: NavItem = {
  href: '/settings',
  label: 'Configurações',
  icon: Gear,
  matchPrefixes: ['/profile'],
};

type AdminNavItem = NavItem & { roles: AppRole[]; enabled?: boolean };

/**
 * S20-UX-01 — `enabled: false` remove placeholders não prontos do nav
 * (rotas continuam acessíveis por URL direta). PI-02 — Compliance também vê
 * Analytics (o RBAC do backend em /analytics/cost já libera os dois papéis).
 */
const ADMIN_ITEMS: AdminNavItem[] = [
  { href: '/admin', label: 'Visão geral', icon: House, roles: ['compliance', 'admin'], exact: true },
  {
    href: '/admin/crm-verifications',
    label: 'Verificações CRM',
    icon: ShieldCheck,
    roles: ['compliance', 'admin'],
  },
  { href: '/admin/diretrizes', label: 'Diretrizes', icon: Database, roles: ['compliance', 'admin'] },
  // F0-D — fila de triagem do feedback dos médicos (curadoria).
  {
    href: '/admin/feedback',
    label: 'Feedback',
    icon: ChatCircleText,
    roles: ['compliance', 'admin'],
  },
  // CC-409 — fila de criação de cartões: o que os médicos procuraram e não tinha cartão.
  {
    href: '/admin/lacunas',
    label: 'Lacunas',
    icon: SealQuestion,
    roles: ['compliance', 'admin'],
  },
  { href: '/audit', label: 'Auditoria', icon: ShieldWarning, roles: ['compliance', 'admin'] },
  { href: '/admin/analytics', label: 'Analytics', icon: ChartBar, roles: ['compliance', 'admin'] },
  { href: '/admin/users', label: 'Usuários', icon: House, roles: ['admin'], enabled: false },
  { href: '/admin/sistema', label: 'Sistema', icon: Gear, roles: ['admin'], enabled: false },
];

export function adminSectionsFor(role: AppRole): NavSection[] {
  return [
    {
      label: 'Operação',
      items: ADMIN_ITEMS.filter((item) => item.roles.includes(role) && item.enabled !== false),
    },
  ];
}

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  if (item.excludePrefixes?.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return false;
  }
  const prefixes = [item.href, ...(item.matchPrefixes ?? [])];
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + '/'));
}
