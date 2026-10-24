import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { cn, initials } from './utils.js';

const sizes = { sm: 'size-7 text-[11px]', md: 'size-8 text-xs', lg: 'size-10 text-sm' } as const;

/** Round avatar: the photo if there is one, otherwise initials on the soft accent. */
export function Avatar({
  name,
  src,
  size = 'md',
  className,
}: {
  name: string | null | undefined;
  src?: string | null;
  size?: keyof typeof sizes;
  className?: string;
}) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-soft font-semibold text-navy-800',
        sizes[size],
        className,
      )}
    >
      {src && <AvatarPrimitive.Image src={src} alt="" className="size-full object-cover" />}
      <AvatarPrimitive.Fallback aria-hidden>{initials(name)}</AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
