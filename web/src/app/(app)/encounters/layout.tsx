import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export default function EncountersLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full" />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}
