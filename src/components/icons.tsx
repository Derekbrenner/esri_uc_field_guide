// Small stroke icons for the bottom nav. 24×24, inherit currentColor.
type P = { className?: string }
const base = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false as const,
}

export function CompassIcon({ className }: P) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="9" />
      <polygon points="15.5 8.5 11 11 8.5 15.5 13 13 15.5 8.5" />
    </svg>
  )
}

export function PinIcon({ className }: P) {
  return (
    <svg {...base} className={className}>
      <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.4" />
    </svg>
  )
}

export function CupIcon({ className }: P) {
  return (
    <svg {...base} className={className}>
      <path d="M6 3h12l-1 6a5 5 0 0 1-10 0L6 3Z" />
      <path d="M5.5 6.5h13" />
      <path d="M12 14v5" />
      <path d="M8.5 21h7" />
    </svg>
  )
}

export function CalendarIcon({ className }: P) {
  return (
    <svg {...base} className={className}>
      <rect x="3.5" y="5" width="17" height="15" rx="2.2" />
      <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" />
    </svg>
  )
}

export function CrewIcon({ className }: P) {
  return (
    <svg {...base} className={className}>
      <circle cx="9" cy="9" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 6.2a3 3 0 0 1 0 5.6M17.5 19a5.5 5.5 0 0 0-3-4.9" />
    </svg>
  )
}

export function TrophyIcon({ className }: P) {
  return (
    <svg {...base} className={className}>
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
      <path d="M7 6H4.5v1.5A3.5 3.5 0 0 0 8 11M17 6h2.5v1.5A3.5 3.5 0 0 1 16 11" />
      <path d="M12 13v4M9 21h6M9.5 21c0-1.7 1-3 2.5-3s2.5 1.3 2.5 3" />
    </svg>
  )
}
