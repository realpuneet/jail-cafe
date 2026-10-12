/** Shimmering placeholder. Size it with className. Hidden from assistive tech. */
export default function Skeleton({ className = 'h-4 w-full' }) {
  return <div aria-hidden="true" className={`skeleton rounded-lg ${className}`} />;
}

export function MenuCardSkeleton() {
  return (
    <div className="card overflow-hidden" aria-hidden="true">
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <div className="space-y-3 p-4">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <div className="flex items-center justify-between pt-1">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-10 w-24 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="container-page space-y-4 py-10" role="status" aria-label="Loading page">
      <Skeleton className="h-10 w-1/2" />
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
