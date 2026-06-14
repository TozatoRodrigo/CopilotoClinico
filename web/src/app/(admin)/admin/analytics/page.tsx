import { Card, CardContent } from '@/components/ui/card';
import { ChartBar } from '@phosphor-icons/react';

export default function AnalyticsPlaceholder() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-lg font-semibold">Analytics</h1>
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <ChartBar className="size-10 text-muted-foreground" weight="duotone" />
          <p className="text-sm text-muted-foreground">
            Dashboard de métricas de uso, custos e performance em desenvolvimento.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
