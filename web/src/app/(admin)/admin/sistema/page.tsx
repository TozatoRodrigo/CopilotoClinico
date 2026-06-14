'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Gear } from '@phosphor-icons/react';

export default function SistemaPlaceholder() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-lg font-semibold">Sistema</h1>
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <Gear className="size-10 text-muted-foreground" weight="duotone" />
          <p className="text-sm text-muted-foreground">
            Configurações de sistema, variáveis de ambiente e health-checks em desenvolvimento.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
