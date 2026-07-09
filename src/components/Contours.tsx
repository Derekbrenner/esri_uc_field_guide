// Ambient topographic contour lines — the survey-chart signature, drawn as a
// stack of concentric, gently-distorted rings. Deterministic (no randomness).

function ring(cx: number, cy: number, r: number, amp: number, phase: number): string {
  const pts: string[] = []
  const steps = 72
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2
    const rr = r + amp * Math.sin(t * 3 + phase) + amp * 0.5 * Math.cos(t * 5 - phase)
    const x = cx + rr * Math.cos(t)
    const y = cy + rr * Math.sin(t) * 0.82 // squash vertically → landform feel
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`)
  }
  return 'M' + pts.join(' L') + 'Z'
}

export default function Contours({ className }: { className?: string }) {
  const cx = 760
  const cy = 210
  const rings = Array.from({ length: 16 }, (_, i) => {
    const r = 40 + i * 34
    const amp = 8 + i * 1.6
    return ring(cx, cy, r, amp, i * 0.6)
  })
  return (
    <svg
      className={className}
      viewBox="0 0 900 460"
      preserveAspectRatio="xMaxYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <g fill="none" stroke="currentColor">
        {rings.map((d, i) => (
          <path
            key={i}
            d={d}
            strokeWidth={i === 6 || i === 11 ? 1.4 : 0.75}
            opacity={0.12 + (i % 5) * 0.03}
          />
        ))}
      </g>
      {/* survey benchmark at the summit */}
      <circle cx={cx} cy={cy} r={3.5} fill="currentColor" opacity={0.5} />
    </svg>
  )
}
