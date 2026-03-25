import { useEffect, useMemo, useState } from 'react'
import { useUser } from '@clerk/clerk-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts'
import { getHistory, getScanById } from '../api/secureiq.js'

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n))
}

function parseDate(d) {
  const dt = new Date(d)
  return Number.isNaN(dt.getTime()) ? null : dt
}

function calculateLivingScore({ currentScore, lastScannedAt, criticalCount, warningCount }) {
  if (currentScore == null) return null
  const now = new Date()
  const last = lastScannedAt || now
  const days = Math.max(0, (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24))

  // Heuristic drift per day:
  // - critical issues degrade faster
  // - warnings degrade slower
  const driftPerDay = 0.25 + criticalCount * 0.08 + warningCount * 0.03
  const degradation = clamp(days * driftPerDay, 0, 30)

  const livingScore = clamp(Math.round(currentScore - degradation), 0, 100)

  return {
    livingScore,
    degradation: Math.round(degradation),
    daysSinceLastScan: Math.round(days * 10) / 10,
    driftPerDay: Math.round(driftPerDay * 100) / 100,
  }
}

export default function LivingSecurityScore({ scanResult }) {
  const { user } = useUser()
  const [history, setHistory] = useState([])
  const [createdAt, setCreatedAt] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!scanResult?.scan_id || !user?.id) return
      setLoading(true)
      try {
        const latestScan = await getScanById(scanResult.scan_id)
        if (!cancelled) setCreatedAt(latestScan?.created_at || null)

        const h = await getHistory(scanResult.domain, user.id)
        if (!cancelled) setHistory(Array.isArray(h) ? h : [])
      } catch (e) {
        // History is optional for the demo; show living score using scanResult only.
        if (!cancelled) setHistory([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [scanResult?.scan_id, scanResult?.domain, user?.id])

  const criticalCount = useMemo(() => {
    return (scanResult?.findings || []).filter(f => f?.status === 'critical').length
  }, [scanResult?.findings])

  const warningCount = useMemo(() => {
    return (scanResult?.findings || []).filter(f => f?.status === 'warning').length
  }, [scanResult?.findings])

  const lastScannedAt = useMemo(() => {
    // Prefer the current scan created_at if available.
    if (createdAt) return parseDate(createdAt)
    // Otherwise use the newest history entry.
    const newest = history?.[0]?.scanned_at
    return newest ? parseDate(newest) : null
  }, [createdAt, history])

  const living = useMemo(() => {
    if (!scanResult) return null
    const currentScore = scanResult?.score
    return calculateLivingScore({
      currentScore,
      lastScannedAt,
      criticalCount,
      warningCount,
    })
  }, [scanResult, lastScannedAt, criticalCount, warningCount])

  const confidencePercent = useMemo(() => {
    const n = history?.length || 0
    const base = n >= 5 ? 85 : n >= 3 ? 75 : n >= 2 ? 65 : n >= 1 ? 55 : 45
    const freshnessBoost = lastScannedAt ? clamp(10 - (living?.daysSinceLastScan || 0), 0, 10) : 0
    return clamp(Math.round(base + freshnessBoost), 30, 92)
  }, [history, lastScannedAt, living?.daysSinceLastScan])

  const livingColor = living?.livingScore >= 75 ? '#66473B' : living?.livingScore >= 55 ? '#B6A596' : '#DC9F85'

  const chartData = useMemo(() => {
    if (!history?.length) return []
    // history is already sorted newest->oldest; reverse for left->right
    const ordered = [...history].reverse()
    return ordered.map(h => ({
      t: new Date(h.scanned_at).toLocaleDateString('en-IN', { month: 'short', day: '2-digit' }),
      score: h.score,
    }))
  }, [history])

  if (!scanResult) return null

  return (
    <section className="border-t pt-8" style={{ borderColor: '#35211A' }}>
      <p className="label-accent mb-6">- LIVING SECURITY SCORE</p>

      {loading && (
        <div className="card">
          <p className="body-copy">Calculating score drift and confidence…</p>
        </div>
      )}

      {living && (
        <div className="space-y-6">
          <div className="card" style={{ borderColor: livingColor }}>
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="label-sm" style={{ color: '#35211A' }}>ADJUSTED (LIVING) SCORE</p>
                <p className="display-lg" style={{ color: livingColor }}>
                  {living.livingScore}
                </p>
                <p className="label-sm" style={{ color: '#B6A596' }}>
                  Drift estimate: -{living.degradation} pts over {living.daysSinceLastScan} days
                </p>
              </div>

              <div style={{ flex: 1, minWidth: 220 }}>
                <p className="label-sm mb-2">DATA CONFIDENCE</p>
                <div className="h-px" style={{ background: '#35211A', height: 2 }}>
                  <div style={{ width: `${confidencePercent}%`, height: 2, background: '#DC9F85' }} />
                </div>
                <p className="label-sm text-right mt-2" style={{ color: '#35211A' }}>
                  {confidencePercent}% confidence
                </p>
                <div className="mt-4 space-y-1">
                  <p className="label-sm" style={{ color: '#35211A' }}>
                    Critical weight: {criticalCount}
                  </p>
                  <p className="label-sm" style={{ color: '#35211A' }}>
                    Warning weight: {warningCount}
                  </p>
                  <p className="label-sm" style={{ color: '#35211A' }}>
                    Drift/day: {living.driftPerDay}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <p className="label-accent mb-3">SCORE HISTORY</p>
            {chartData.length ? (
              <div style={{ height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid stroke="rgba(53,33,26,0.5)" />
                    <XAxis dataKey="t" stroke="#35211A" tick={{ fill: '#B6A596', fontSize: 12 }} />
                    <YAxis domain={[0, 100]} stroke="#35211A" tick={{ fill: '#B6A596', fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{ background: '#1e1e1e', border: '1px solid #35211A' }}
                      labelStyle={{ color: '#EBDCC4' }}
                      itemStyle={{ color: '#EBDCC4' }}
                      formatter={(v) => [`${v}`, 'Score']}
                    />
                    <Line type="monotone" dataKey="score" stroke="#DC9F85" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="body-copy">No scan history available yet.</p>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

