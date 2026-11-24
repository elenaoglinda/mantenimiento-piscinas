/**
 * The Loro logo: the parrot mark (a navy head with an aqua wing and a navy eye) plus the
 * lowercase "loro" wordmark. Path data is copied from the meetloro.com website so the panel
 * and the site can't drift apart; the favicon (public/favicon.svg) draws the same mark.
 *
 * Colours come from tokens (`navy-800`, `brand-400`), never hex values.
 * `markOnly` drops the wordmark for tight spaces such as the collapsed sidebar rail.
 */

// The mark, drawn in a 0..100 box and shared by both variants below.
const HEAD = 'M43.75 10.06 A40 40 0 0 0 43.75 89.94 L43.75 71.88 A22 22 0 0 1 43.75 28.12 Z';
const WING = 'M48.25 50 L48.25 10.06 A40 40 0 0 1 76.64 75.71 C72.64 62 54.25 65 48.25 50 Z';

// "loro" in the website's wordmark, as outlines (no font needed).
const WORDMARK =
  'M134.25 110.25V0H152.325V110.25Z' +
  'M204.6 112.5Q192.45 112.5 183.375 107.025Q174.3 101.55 169.3125 91.9125Q164.325 82.275 164.325 69.75Q164.325 57 169.425 47.4Q174.525 37.8 183.6 32.4Q192.675 27 204.6 27Q216.825 27 225.9 32.475Q234.975 37.95 240 47.5875Q245.025 57.225 245.025 69.75Q245.025 82.35 239.9625 91.9875Q234.9 101.625 225.825 107.0625Q216.75 112.5 204.6 112.5ZM204.6 95.55Q215.4 95.55 220.65 88.35Q225.9 81.15 225.9 69.75Q225.9 57.975 220.575 50.9625Q215.25 43.95 204.6 43.95Q197.325 43.95 192.6375 47.2125Q187.95 50.475 185.7 56.2875Q183.45 62.1 183.45 69.75Q183.45 81.525 188.8125 88.5375Q194.175 95.55 204.6 95.55Z' +
  'M255.525 110.25V29.25H271.5V48.975L269.55 46.425Q271.05 42.375 273.5625 39.0375Q276.075 35.7 279.6 33.525Q282.6 31.5 286.2375 30.3375Q289.875 29.175 293.7 28.9125Q297.525 28.65 301.125 29.25V46.125Q297.525 45.075 292.8375 45.45Q288.15 45.825 284.4 48.075Q280.65 50.1 278.2875 53.25Q275.925 56.4 274.8 60.4125Q273.675 64.425 273.675 69.075V110.25Z' +
  'M345.15 112.5Q333 112.5 323.925 107.025Q314.85 101.55 309.8625 91.9125Q304.875 82.275 304.875 69.75Q304.875 57 309.975 47.4Q315.075 37.8 324.15 32.4Q333.225 27 345.15 27Q357.375 27 366.45 32.475Q375.525 37.95 380.55 47.5875Q385.575 57.225 385.575 69.75Q385.575 82.35 380.5125 91.9875Q375.45 101.625 366.375 107.0625Q357.3 112.5 345.15 112.5ZM345.15 95.55Q355.95 95.55 361.2 88.35Q366.45 81.15 366.45 69.75Q366.45 57.975 361.125 50.9625Q355.8 43.95 345.15 43.95Q337.875 43.95 333.1875 47.2125Q328.5 50.475 326.25 56.2875Q324 62.1 324 69.75Q324 81.525 329.3625 88.5375Q334.725 95.55 345.15 95.55Z';

function Mark() {
  return (
    <>
      <path d={HEAD} className="fill-navy-800" />
      <path d={WING} className="fill-brand-400" />
      <circle cx="36" cy="46" r="5.5" className="fill-navy-800" />
    </>
  );
}

export function Logo({
  size = 'md',
  markOnly = false,
  className = '',
}: {
  size?: 'sm' | 'md' | 'lg';
  markOnly?: boolean;
  className?: string;
}) {
  const height = { sm: 'h-7', md: 'h-8', lg: 'h-10' }[size];

  if (markOnly) {
    return (
      <svg
        viewBox="0 0 100 100"
        role="img"
        aria-label="Loro"
        className={`${height} w-auto shrink-0 ${className}`}
      >
        <g transform="translate(6 0) scale(1.12) translate(-6 -10.06)">
          <Mark />
        </g>
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 393.57 114.25"
      role="img"
      aria-label="Loro"
      className={`${height} w-auto shrink-0 ${className}`}
    >
      <g transform="scale(1.3802) translate(-6 -10.06)">
        <Mark />
      </g>
      <path d={WORDMARK} className="fill-navy-800" />
    </svg>
  );
}
