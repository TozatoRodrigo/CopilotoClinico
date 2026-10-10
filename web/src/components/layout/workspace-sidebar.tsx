'use client';

import Link from 'next/link';
import type { ElementType, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { CaretDoubleLeft, MagnifyingGlass } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { Kbd } from '@/components/ui/kbd';
import { isNavItemActive, type NavItem, type NavSection } from '@/components/layout/nav-config';

/**
 * Sidebar no estilo Notion: fundo cinza-quente, itens de 30px com ícone
 * cinza, item ativo com fundo sutil e texto escuro, rótulos de seção em
 * 12px. Compartilhado entre o workspace clínico e o console admin.
 */

function SidebarRow({
  icon: Icon,
  label,
  count,
  active,
  accent,
  trailing,
  className,
}: {
  icon: ElementType;
  label: ReactNode;
  count?: number | string;
  active?: boolean;
  /** Ícone na cor de ação (ex.: "Novo caso"). */
  accent?: boolean;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn('flex min-w-0 flex-1 items-center gap-2', className)}>
      <Icon
        aria-hidden="true"
        weight={active ? 'fill' : 'regular'}
        className={cn(
          'size-[18px] shrink-0',
          accent ? 'text-primary' : active ? 'text-foreground' : 'text-muted-foreground',
        )}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && count !== null && count !== '' && (
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{count}</span>
      )}
      {trailing}
    </span>
  );
}

const rowClass = (active: boolean) =>
  cn(
    'group/row flex h-[30px] w-full items-center rounded-md px-2 text-left text-sm font-medium transition-colors duration-75 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none max-md:h-9',
    active
      ? 'bg-active text-foreground'
      : 'text-sidebar-foreground hover:bg-hover hover:text-foreground',
  );

export function SidebarLink({
  item,
  accent,
  onNavigate,
}: {
  item: NavItem;
  accent?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = isNavItemActive(item, pathname);
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
      className={rowClass(active)}
    >
      <SidebarRow icon={item.icon} label={item.label} count={item.count} active={active} accent={accent} />
    </Link>
  );
}

export function SidebarSearchButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Buscar — ações rápidas (⌘K)"
      className={rowClass(false)}
    >
      <SidebarRow
        icon={MagnifyingGlass}
        label="Buscar"
        trailing={
          <Kbd className="hidden border-transparent bg-transparent group-hover/row:inline-flex">
            ⌘K
          </Kbd>
        }
      />
    </button>
  );
}

export function WorkspaceSidebar({
  header,
  topItems,
  sections,
  footer,
  onCollapse,
  onNavigate,
  className,
}: {
  /** Seletor de workspace/conta (topo). */
  header: ReactNode;
  /** Itens fixos do topo (Buscar, Plantão, Novo caso). */
  topItems?: ReactNode;
  sections: NavSection[];
  footer?: ReactNode;
  /** Quando passado, mostra o botão « para recolher (desktop). */
  onCollapse?: () => void;
  /** Chamado ao navegar (fecha o sheet no mobile). */
  onNavigate?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'group/sidebar flex h-full w-full flex-col bg-sidebar text-sidebar-foreground',
        className,
      )}
    >
      <div className="flex items-center gap-1 px-2 pt-2">
        {header}
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            aria-label="Recolher barra lateral"
            title="Recolher barra lateral"
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover/sidebar:opacity-100 hover:bg-hover hover:text-foreground focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
          >
            <CaretDoubleLeft className="size-4" />
          </button>
        )}
      </div>

      <nav aria-label="Navegação principal" className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pt-1 pb-2">
        {topItems && <div className="flex flex-col gap-px">{topItems}</div>}

        {sections.map((section, index) => (
          <div key={section.label ?? index} className="mt-5 flex flex-col gap-px first:mt-3">
            {section.label && (
              <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">{section.label}</p>
            )}
            {section.items.map((item) => (
              <SidebarLink key={item.href} item={item} onNavigate={onNavigate} />
            ))}
          </div>
        ))}

        <div className="flex-1" />

        {footer && <div className="mt-4 flex flex-col gap-px">{footer}</div>}
      </nav>
    </div>
  );
}
