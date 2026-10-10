'use client';

import { ShieldCheck, ShieldWarning, Users } from '@phosphor-icons/react';
import { ComingSoonPage } from '../_components/coming-soon';

export default function UsersPlaceholder() {
  return (
    <ComingSoonPage
      icon={Users}
      title="Usuários"
      summary="Gestão de médicos, papéis e permissões em desenvolvimento."
      planned={[
        'Lista de médicos com status do CRM e último acesso',
        'Papéis (médico, compliance, admin) e permissões por papel',
        'Reset de MFA pela interface — hoje feito pela API administrativa',
      ]}
      meanwhile={[
        {
          href: '/admin/crm-verifications',
          label: 'Verificações CRM',
          description: 'Aprovar ou rejeitar o acesso de novos médicos',
          icon: ShieldCheck,
        },
        {
          href: '/audit',
          label: 'Auditoria',
          description: 'Quem fez o quê, com trilha imutável',
          icon: ShieldWarning,
        },
      ]}
    />
  );
}
