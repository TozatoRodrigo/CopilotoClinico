'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Users } from '@phosphor-icons/react';

export default function UsersPlaceholder() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-lg font-semibold">Usuários</h1>
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <Users className="size-10 text-muted-foreground" weight="duotone" />
          <p className="text-sm text-muted-foreground">
            Gestão de médicos, papéis e permissões em desenvolvimento.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
