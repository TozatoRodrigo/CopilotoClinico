import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-9 w-36 rounded-md" />
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-[1.4fr_1fr]">
        <Skeleton className="h-[104px] rounded-[14px]" />
        <Skeleton className="h-[104px] rounded-[14px]" />
      </div>

      {/* Recent encounters */}
      <div className="rounded-[14px] border border-clinical-line p-5 space-y-3">
        <Skeleton className="h-5 w-48 mb-4" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between py-2">
            <div className="space-y-1">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
