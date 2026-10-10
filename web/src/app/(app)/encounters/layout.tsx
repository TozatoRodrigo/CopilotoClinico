import { Suspense } from 'react';
import { NotionPageSkeleton } from './_components/skeletons';

export default function EncountersLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<NotionPageSkeleton />}>{children}</Suspense>;
}
