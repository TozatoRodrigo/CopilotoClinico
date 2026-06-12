import { Suspense } from "react";

export default function EncountersLayout({ children }: { children: React.ReactNode }) {
  return <Suspense>{children}</Suspense>;
}
