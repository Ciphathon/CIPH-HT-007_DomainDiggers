import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts'

function toRadarData(dimensions) {
  // Expect:
  //  - [{ dimension: string, value: number }, ...]
  // Convert to recharts format:
  //  - [{ dimension: string, value: number, ...}] where each key is a dimension.
  if (!Array.isArray(dimensions)) return []
  const cleaned = dimensions
    .filter(d => d && typeof d.dimension === 'string')
    .map(d => ({
      dimension: d.dimension,
      value: Number(d.value ?? 0),
    }))

  if (!cleaned.length) return []

  // Use a stable set of keys.
  // RadarChart expects data points where each data item has all keys.
  const keys = cleaned.map(d => d.dimension)
  const row = { subject: 'Psychological Dimensions' }
  for (const d of cleaned) row[d.dimension] = clamp(d.value, 0, 100)

  return [{ ...row, subject: keys[0] }]
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n))
}

export default function PsychDimensions({ dimensions }) {
  if (!Array.isArray(dimensions) || dimensions.length === 0) return null

  const cleaned = dimensions
    .filter(d => d && typeof d.dimension === 'string')
    .map(d => ({ dimension: d.dimension, value: Number(d.value ?? 0) }))
    .slice(0, 6)

  if (!cleaned.length) return null

  const keys = cleaned.map(d => d.dimension)
  const row = { subject: 'Psych Dimensions' }
  for (const d of cleaned) row[d.dimension] = clamp(d.value, 0, 100)
  const radarData = [row]

  return (
    <div className="card">
      <p className="label-accent mb-3">PSYCHOLOGICAL DIMENSIONS</p>
      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData}>
            <PolarGrid stroke="rgba(53,33,26,0.5)" />
            <PolarAngleAxis dataKey="subject" />
            <PolarRadiusAxis angle={30} domain={[0, 100]} />
            {keys.map((k, idx) => (
              <Radar
                key={k}
                name={k}
                dataKey={k}
                stroke={idx % 2 === 0 ? '#DC9F85' : '#B6A596'}
                fill={idx % 2 === 0 ? 'rgba(220,159,133,0.12)' : 'rgba(182,165,150,0.10)'}
                fillOpacity={1}
              />
            ))}
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-2 mt-4">
        {cleaned.map(d => (
          <span
            key={d.dimension}
            className="label-sm"
            style={{
              border: '1px solid var(--border)',
              borderRadius: 2,
              padding: '4px 8px',
              color: '#EBDCC4',
              background: 'rgba(102,71,59,0.08)',
            }}
          >
            {d.dimension}: {Math.round(d.value)}
          </span>
        ))}
      </div>
    </div>
  )
}

