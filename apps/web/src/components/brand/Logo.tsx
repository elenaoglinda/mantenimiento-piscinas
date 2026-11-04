import { Waves } from 'lucide-react';

/**
 * The Cloro mark: lucide's Waves in white on a navy rounded square, plus the wordmark in
 * Space Grotesk. Same mark as cloro.app and the favicon (public/favicon.svg).
 *
 * `markOnly` drops the wordmark for tight spaces such as the collapsed sidebar rail.
 */
export function Logo({
  size = 'md',
  markOnly = false,
  className = '',
}: {
  size?: 'sm' | 'md' | 'lg';
  markOnly?: boolean;
  className?: string;
}) {
  const box = { sm: 'size-7', md: 'size-8', lg: 'size-10' }[size];
  const icon = { sm: 16, md: 18, lg: 22 }[size];
  const word = { sm: 'text-base', md: 'text-lg', lg: 'text-2xl' }[size];

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span
        aria-hidden
        className={`${box} inline-flex shrink-0 items-center justify-center rounded-[8px] bg-navy-800 text-white`}
      >
        <Waves size={icon} strokeWidth={2.25} />
      </span>
      {markOnly ? (
        <span className="sr-only">Cloro</span>
      ) : (
        <span className={`font-display font-semibold tracking-tight text-navy-800 ${word}`}>
          Cloro
        </span>
      )}
    </span>
  );
}
