'use client';

import { ChartBar, Gear, ShieldWarning } from '@phosphor-icons/react';
import { ComingSoonPage } from '../_components/coming-soon';

export default function SistemaPlaceholder() {
  return (
    <ComingSoonPage
      icon={Gear}
      title="Sistema"
      summary="Configurações de sistema, variáveis de ambiente e health-checks em desenvolvimento."
      planned={[
        'Health-checks da API, do banco e da fila de processamento',
        'Variáveis de ambiente em modo somente leitura',
        'Configurações gerais do sistema',
      ]}
      meanwhile={[
        {
          href: '/admin/analytics',
          label: 'Analytics',
          description: 'Custo de IA, latência por modelo e funil de produto',
          icon: ChartBar,
        },
        {
          href: '/audit',
          label: 'Auditoria',
          description: 'Integridade da cadeia de auditoria e eventos do sistema',
          icon: ShieldWarning,
        },
      ]}
    />
  );
}
