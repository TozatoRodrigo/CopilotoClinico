'use client';

import { usePathname } from 'next/navigation';
import {
  BookOpen,
  Calculator,
  ChartBar,
  ChatCircleText,
  ClipboardText,
  Database,
  FileText,
  Gear,
  House,
  IdentificationCard,
  ShieldCheck,
  SquaresFour,
  Toolbox,
  UserCircle,
  Users,
} from '@phosphor-icons/react';
import { CALCULATOR_CATALOG } from '@clinical-tools/calculator-catalog';
import { calculatorName, TOOLS } from '@clinical-tools/catalog';
import { useEncounterDetail } from '@/lib/clinical-queries';
import { Breadcrumb, type BreadcrumbItem } from '@/components/ui/breadcrumb';

/**
 * Trilha da rota atual exibida na barra superior (como o caminho de páginas
 * do Notion). Para rotas de caso, o rótulo vem do mesmo cache do React Query
 * que a própria página usa (`['encounter', id]`), então não há request extra.
 */

const STATIC: Record<string, BreadcrumbItem> = {
  dashboard: { label: 'Plantão', icon: House },
  encounters: { label: 'Casos', icon: ClipboardText },
  guidelines: { label: 'Diretrizes', icon: BookOpen },
  audit: { label: 'Auditoria', icon: ShieldCheck },
  settings: { label: 'Configurações', icon: Gear },
  profile: { label: 'Perfil', icon: UserCircle },
  'verificacao-crm': { label: 'Verificação de CRM', icon: IdentificationCard },
  admin: { label: 'Console', icon: SquaresFour },
};

const ADMIN_CHILDREN: Record<string, BreadcrumbItem> = {
  'crm-verifications': { label: 'Verificações CRM', icon: ShieldCheck },
  diretrizes: { label: 'Diretrizes', icon: Database },
  feedback: { label: 'Feedback', icon: ChatCircleText },
  analytics: { label: 'Analytics', icon: ChartBar },
  users: { label: 'Usuários', icon: Users },
  sistema: { label: 'Sistema', icon: Gear },
};

const CASE_CHILDREN: Record<string, string> = {
  capture: 'Captura',
  result: 'Análise',
  conversation: 'Conversa',
  documents: 'Documentos',
};

function EncounterCrumbs({ segments }: { segments: string[] }) {
  // segments: ['encounters', id, ...rest]
  const id = segments[1] ?? '';
  const { data } = useEncounterDetail(id);
  const caseLabel = data
    ? (data.patientRef ?? data.chiefComplaint ?? 'Consulta rápida')
    : `Caso ${id.slice(0, 8)}`;
  const base = `/encounters/${id}`;
  const rest = segments.slice(2);

  const items: BreadcrumbItem[] = [
    { label: 'Casos', href: '/encounters', icon: ClipboardText },
    { label: caseLabel, href: rest.length > 0 ? base : undefined },
  ];
  if (rest[0]) {
    const label = CASE_CHILDREN[rest[0]] ?? rest[0];
    const isDocumentEdit = rest[0] === 'documents' && rest.length > 1;
    items.push({ label, href: isDocumentEdit ? `${base}/documents` : undefined });
    if (isDocumentEdit) items.push({ label: 'Editar documento', icon: FileText });
  }
  return <Breadcrumb items={items} />;
}

/**
 * ADR-017 — Ferramentas › Calculadoras › nome da calculadora, ou
 * Ferramentas › nome do roteiro (ACLS).
 */
function ferramentasCrumbs(segments: string[]): BreadcrumbItem[] {
  const [, section, id] = segments;
  const items: BreadcrumbItem[] = [
    { label: 'Ferramentas', icon: Toolbox, href: section ? '/ferramentas' : undefined },
  ];
  if (section !== 'calculadoras') {
    const tool = TOOLS.find((entry) => entry.id === section && entry.status === 'disponivel');
    if (tool) items.push({ label: tool.name, href: id ? `/ferramentas/${tool.id}` : undefined });
    return items;
  }
  items.push({
    label: 'Calculadoras',
    icon: Calculator,
    href: id ? '/ferramentas/calculadoras' : undefined,
  });
  const entry = id ? CALCULATOR_CATALOG.find((calculator) => calculator.id === id) : undefined;
  if (entry) items.push({ label: calculatorName(entry) });
  return items;
}

export function RouteBreadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);
  const [first, second] = segments;

  if (!first) return null;

  if (first === 'encounters' && second && second !== 'new') {
    return <EncounterCrumbs segments={segments} />;
  }

  if (first === 'ferramentas') return <Breadcrumb items={ferramentasCrumbs(segments)} />;

  const root = STATIC[first];
  if (!root) return null;

  const items: BreadcrumbItem[] = [{ ...root, href: segments.length > 1 ? `/${first}` : undefined }];
  if (first === 'encounters' && second === 'new') items.push({ label: 'Novo caso' });
  if (first === 'admin' && second) {
    const child = ADMIN_CHILDREN[second];
    if (child) items.push({ ...child, href: undefined });
  }
  return <Breadcrumb items={items} />;
}
