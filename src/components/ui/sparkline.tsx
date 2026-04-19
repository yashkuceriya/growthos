import { cn } from '@/lib/utils'

export function Sparkline({
  data,
  className,
  color = '#34d399',
}: {
  data: number[]
  className?: string
  color?: string
}) {
  if (data.length === 0) return null
  const w = 80
  const h = 24
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1
  const barW = w / data.length

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn('w-full h-full', className)} preserveAspectRatio="none">
      {data.map((v, i) => {
        const barH = ((v - min) / range) * h
        return (
          <rect
            key={i}
            x={i * barW + 0.5}
            y={h - barH}
            width={Math.max(barW - 1, 1)}
            height={Math.max(barH, 0.5)}
            fill={color}
            opacity={0.4 + (v - min) / range * 0.6}
          />
        )
      })}
    </svg>
  )
}
