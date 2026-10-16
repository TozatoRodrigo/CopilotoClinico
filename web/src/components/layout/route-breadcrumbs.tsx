'use client';

import { usePathname } from 'next/navigation';
import {
  BookOpen,
  ChartBar,
  ChatCircleText,
  ClipboardText,
  Database,
  EnvelopeSimple,
  FileText,
  Gear,
  GraduationCap,
  House,
  IdentificationCard,
  Scales,
  ShieldCheck,
  SquaresFour,
  Stethoscope,
  UserCircle,
  Users,
} from '@phosphor-icons/react';
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
  'revise-seu-plantao': { label: 'Revisão do plantão', icon: GraduationCap },
  admin: { label: 'Console', icon: SquaresFour },
  mentoria: { label: 'Mentoria', icon: Stethoscope },
};

const ADMIN_CHILDREN: Record<string, BreadcrumbItem> = {
  'crm-verifications': { label: 'Verificações CRM', icon: ShieldCheck },
  termos: { label: 'Termos', icon: Scales },
  diretrizes: { label: 'Diretrizes', icon: Database },
  beta: { label: 'Beta', icon: EnvelopeSimple },
  feedback: { label: 'Feedback', icon: ChatCircleText },
  analytics: { label: 'Analytics', icon: ChartBar },
  mentoria: { label: 'Mentoria', icon: Stethoscope },
  users: { label: 'Usuários', icon: Users },
  sistema: { label: 'Sistema', icon: Gear },
};

/** CC-802 — abas da revisão do plantão que têm URL própria. */
const SHIFT_REVIEW_CHILDREN: Record<string, BreadcrumbItem> = {
  'seu-mapa': { label: 'Seu mapa' },
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

export function RouteBreadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);
  const [first, second] = segments;

  if (!first) return null;

  if (first === 'encounters' && second && second !== 'new') {
    return <EncounterCrumbs segments={segments} />;
  }

  const root = STATIC[first];
  if (!root) return null;

  const items: BreadcrumbItem[] = [{ ...root, href: segments.length > 1 ? `/${first}` : undefined }];
  if (first === 'encounters' && second === 'new') items.push({ label: 'Novo caso' });
  if (first === 'mentoria' && second) items.push({ label: 'Pedido' });
  if (first === 'admin' && second) {
    const child = ADMIN_CHILDREN[second];
    if (child) items.push({ ...child, href: undefined });
  }
  if (first === 'revise-seu-plantao' && second) {
    const child = SHIFT_REVIEW_CHILDREN[second];
    if (child) items.push({ ...child, href: undefined });
  }
  return <Breadcrumb items={items} />;
}
