import { useEffect, useState } from 'react'
import { predictThreat } from '../api/secureiq.js'

function threatColor(threatScore) {
  if (threatScore >= 75) return '#DC9F85'
  if (threatScore >= 45) return '#B6A596'
  return '#66473B'
}

export default function PredictiveThreat({ scanResult, userProfile }) {
  const [prediction, setPrediction] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      if (!scanResult?.scan_id) return
      setLoading(true)
      setError(null)
      try {
        const res = await predictThreat({
          scan_id: scanResult.scan_id,
          horizon_days: 30,
          clerk_user_id: userProfile?.clerk_user_id || 'anonymous',
        })
        if (!cancelled) setPrediction(res?.error ? null : res)
      } catch (e) {
        if (!cancelled) setError('Prediction unavailable')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [scanResult?.scan_id, userProfile?.clerk_user_id])

  if (!scanResult) return null

  return (
    <section className="border-t pt-8" style={{ borderColor: '#35211A' }}>
      <p className="label-accent mb-6">- 30-DAY PREDICTIVE THREAT</p>

      {loading && (
        <div className="card">
          <p className="body-copy">Running predictive scoring…</p>
        </div>
      )}

      {error && (
        <div className="card">
          <p className="label-sm" style={{ color: '#DC9F85' }}>
            {error}
          </p>
        </div>
      )}

      {prediction && (
        <div className="space-y-6">
          <div className="card" style={{ borderColor: prediction.predicted_threat_score >= 75 ? '#DC9F85' : '#35211A' }}>
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="label-sm" style={{ color: '#35211A' }}>PREDICTED THREAT SCORE</p>
                <p className="display-lg" style={{ color: threatColor(prediction.predicted_threat_score) }}>
                  {prediction.predicted_threat_score}
                </p>
                <p className="label-sm" style={{ color: '#B6A596' }}>
                  Confidence: {prediction.confidence} ({prediction.confidence_percent}%)
                </p>
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <p className="label-sm mb-2">TRAJECTORY BAR</p>
                <div className="h-px" style={{ background: '#35211A' }}>
                  <div
                    className="h-px"
                    style={{
                      width: `${Math.max(0, Math.min(100, prediction.predicted_threat_score))}%`,
                      background: threatColor(prediction.predicted_threat_score),
                      height: 2,
                    }}
                  />
                </div>
                <p className="label-sm text-right mt-2" style={{ color: '#35211A' }}>
                  Predicted security score: {prediction.predicted_security_score}/100
                </p>
              </div>
            </div>
          </div>

          <div className="card">
            <p className="label-accent mb-3">KEY DRIVERS</p>
            {prediction.key_drivers?.length ? (
              <div className="space-y-2">
                {prediction.key_drivers.map((d, idx) => (
                  <div
                    key={`${d.check}-${idx}`}
                    className="p-3 rounded-xl"
                    style={{ background: 'var(--bg-card-2)', border: '1px solid var(--border)' }}
                  >
                    <div className="flex justify-between gap-4">
                      <p className="label-sm" style={{ color: '#EBDCC4' }}>
                        {d.check || 'Unknown'}
                      </p>
                      <p className="label-sm" style={{ color: d.status === 'critical' ? '#DC9F85' : '#B6A596' }}>
                        {String(d.status || '').toUpperCase()}
                      </p>
                    </div>
                    <p className="label-sm mt-1" style={{ color: '#66473B' }}>
                      Impact weight: {d.impact ?? 0}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="body-copy">No actionable drivers detected.</p>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

