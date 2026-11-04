import { Card } from '../../components/ui/Card.js';
import { Skeleton, SkeletonText } from '../../components/ui/Skeleton.js';

/** Shown inside the shell while a page's code loads (pages are lazy-loaded; see App.tsx). */
export function PageSkeleton() {
  return (
    <div aria-busy="true">
      <Skeleton className="mb-2 h-8 w-56" />
      <Skeleton className="mb-8 h-4 w-80 max-w-full" />
      <Card>
        <SkeletonText lines={5} />
      </Card>
    </div>
  );
}
