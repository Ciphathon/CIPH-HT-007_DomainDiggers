import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Copy, Check, RefreshCw } from 'lucide-react'
import { generateAutoFix, verifyAutoFix, verifyFix } from '../api/secureiq.js'

export default function FindingCard({ finding, scanId, domain, scanResult, onScoreUpdate }) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [verifyResult, setVerifyResult] = useState(null)
  const [autoFixPhase, setAutoFixPhase] = useState('idle') // idle | generating | verifying | fixed | failed
  const [generatedRecord, setGeneratedRecord] = useState(null)
  const [autoFixMessage, setAutoFixMessage] = useState('')
  const fix = finding.fixes || {}

  const borderColor = { critical: 'var(--red)', warning: 'var(--yellow)', pass: 'var(--green)' }[finding.status] || 'var(--border)'
  const isDnsFinding = ['SPF Record', 'DMARC Policy', 'DKIM Signing'].some(
    c => String(c).toLowerCase() === String(finding.check).toLowerCase()
  )

  const copy = (text) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleVerify = async () => {
    setVerifying(true)
    try {
      const res = await verifyFix(scanId, finding.check, domain)
      setVerifyResult(res)
    } catch (e) {
      setVerifyResult({ fixed: false, message: 'Verification failed' })
    }
    setVerifying(false)
  }

  const handleAutoFix = async () => {
    if (!scanId || !isDnsFinding) return
    if (autoFixPhase === 'generating' || autoFixPhase === 'verifying') return

    setAutoFixMessage('')
    setAutoFixPhase('generating')
    setGeneratedRecord(null)
    setVerifyResult(null)

    try {
      const hostingProvider = scanResult?.hosting_provider || scanResult?.hostingProvider || 'unknown'
      const emailProvider = scanResult?.email_provider || scanResult?.emailProvider || 'google'

      const record = await generateAutoFix({
        check_name: finding.check,
        domain,
        hosting_provider: hostingProvider,
        email_provider: emailProvider,
      })

      setGeneratedRecord(record)
      const expectedValue = record?.record_value || ''
      setAutoFixPhase('verifying')

      const res = await verifyAutoFix({
        domain,
        check_name: finding.check,
        expected_value: expectedValue,
        scan_id: scanId,
      })

      if (res?.verified) {
        setAutoFixPhase('fixed')
        setAutoFixMessage(res.message || `Auto-fix verified. +${res.points_gained} pts`)
        onScoreUpdate?.(res.new_score, res.points_gained)
      } else {
        setAutoFixPhase('failed')
        setAutoFixMessage(res?.message || 'Auto-fix not verified yet.')
      }
    } catch (e) {
      setAutoFixPhase('failed')
      setAutoFixMessage(`Auto-fix failed: ${String(e?.message || e)}`)
    }
  }

  return (
    <motion.div
      layout
      className="rounded-2xl border overflow-hidden transition-all"
      style={{
        borderLeft: `3px solid ${borderColor}`,
        borderTop: '1px solid var(--border)',
        borderRight: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-card)',
      }}
    >
      <button className="w-full p-4 flex items-center gap-3 text-left" onClick={() => setExpanded(e => !e)}>
        <span className={`status-${finding.status} flex-shrink-0`}>
          {finding.status === 'pass' ? '✓' : finding.status === 'warning' ? '⚠' : '✕'} {finding.status}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-1)' }}>{finding.check}</p>
          <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-2)' }}>
            {finding.explanation || finding.detail}
          </p>
        </div>
        <ChevronDown size={16} style={{ color: 'var(--text-2)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4 border-t" style={{ borderColor: 'var(--border)' }}>
              <div className="pt-4">
                <p className="text-sm" style={{ color: 'var(--text-2)', lineHeight: 1.6 }}>{finding.explanation || finding.detail}</p>
                {finding.india_context && (
                  <div className="mt-3 p-3 rounded-xl" style={{ background: 'rgba(210,153,34,0.08)', border: '1px solid rgba(210,153,34,0.2)' }}>
                    <p className="text-xs" style={{ color: 'var(--yellow)' }}>🇮🇳 India-specific risk: {finding.india_context}</p>
                  </div>
                )}
              </div>

              {finding.fix_preview && finding.status !== 'pass' && (
                <div className="p-3 rounded-xl" style={{ background: 'var(--bg-card-2)', border: '1px solid var(--border)' }}>
                  <p className="text-xs font-semibold mb-1" style={{ color: 'var(--blue)' }}>🔧 Fix Preview</p>
                  <p className="text-xs italic" style={{ color: 'var(--text-2)' }}>{finding.fix_preview}</p>
                </div>
              )}

              {fix.exact_value && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>Exact value to use:</p>
                    <button onClick={() => copy(fix.exact_value)} className="flex items-center gap-1 text-xs" style={{ color: 'var(--blue)' }}>
                      {copied ? <Check size={12} /> : <Copy size={12} />}
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <div className="p-3 rounded-xl font-mono text-xs overflow-x-auto" style={{ background: '#0D1117', color: 'var(--green)', border: '1px solid var(--border)' }}>
                    {fix.exact_value}
                  </div>
                </div>
              )}

              {isDnsFinding && (
                <div className="mt-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>AUTO-FIX —</p>
                    <button
                      onClick={handleAutoFix}
                      disabled={autoFixPhase === 'generating' || autoFixPhase === 'verifying'}
                      className="btn-ghost text-xs px-4 py-2"
                      style={{
                        cursor: autoFixPhase === 'generating' || autoFixPhase === 'verifying' ? 'not-allowed' : 'pointer',
                        border: '1px solid var(--border)',
                        color: autoFixPhase === 'fixed' ? 'var(--green)' : 'var(--blue)',
                        background: 'transparent',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {autoFixPhase === 'generating'
                        ? 'GENERATING…'
                        : autoFixPhase === 'verifying'
                          ? 'VERIFYING…'
                          : autoFixPhase === 'fixed'
                            ? 'FIXED —'
                            : autoFixPhase === 'failed'
                              ? 'TRY AGAIN —'
                              : 'AUTO-FIX —'}
                    </button>
                  </div>

                  {generatedRecord && (
                    <div className="p-3 rounded-xl" style={{ background: 'var(--bg-card-2)', border: '1px solid var(--border)', marginTop: 10 }}>
                      <p className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>Suggested record</p>
                      <div className="mt-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                          <p className="label-sm" style={{ color: 'var(--text-3)' }}>TYPE</p>
                          <p className="label-sm" style={{ color: 'var(--text-2)' }}>{generatedRecord.record_type || 'TXT'}</p>
                        </div>
                        <div>
                          <p className="label-sm" style={{ color: 'var(--text-3)' }}>TTL</p>
                          <p className="label-sm" style={{ color: 'var(--text-2)' }}>{generatedRecord.ttl ?? '-'}</p>
                        </div>
                      </div>
                      <div className="mt-2">
                        <p className="label-sm" style={{ color: 'var(--text-3)' }}>NAME</p>
                        <p className="label-sm" style={{ color: 'var(--text-2)' }}>{generatedRecord.record_name || '@ / _dmarc / default._domainkey'}</p>
                      </div>
                      {generatedRecord.record_value && (
                        <div style={{ marginTop: 10 }}>
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>VALUE</p>
                            <button onClick={() => copy(generatedRecord.record_value)} className="flex items-center gap-1 text-xs" style={{ color: 'var(--blue)' }}>
                              {copied ? <Check size={12} /> : <Copy size={12} />}
                              {copied ? 'Copied!' : 'Copy'}
                            </button>
                          </div>
                          <div className="p-3 rounded-xl font-mono text-xs overflow-x-auto" style={{ background: '#0D1117', color: 'var(--green)', border: '1px solid var(--border)', marginTop: 8 }}>
                            {generatedRecord.record_value}
                          </div>
                        </div>
                      )}
                      {generatedRecord.verification_command && (
                        <div style={{ marginTop: 10 }}>
                          <p className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>Verification command</p>
                          <code className="block mt-2 p-3 rounded-xl font-mono text-xs overflow-x-auto" style={{ background: '#0D0D0D', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                            {generatedRecord.verification_command}
                          </code>
                        </div>
                      )}
                      {generatedRecord.time_estimate && (
                        <p className="text-xs" style={{ color: 'var(--text-2)', marginTop: 8 }}>
                          Time estimate: {generatedRecord.time_estimate}
                        </p>
                      )}
                    </div>
                  )}

                  {autoFixMessage && (
                    <p className="text-xs" style={{ color: autoFixPhase === 'fixed' ? 'var(--green)' : 'var(--yellow)', marginTop: 8 }}>
                      {autoFixMessage}
                    </p>
                  )}
                </div>
              )}

              {fix.steps?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-2)' }}>Steps to fix:</p>
                  <ol className="space-y-2">
                    {fix.steps.map((s, i) => (
                      <li key={i} className="flex gap-3 text-xs" style={{ color: 'var(--text-2)' }}>
                        <span className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold"
                          style={{ background: 'var(--bg-card-2)', color: 'var(--blue)' }}>{i + 1}</span>
                        <div>
                          <span style={{ color: 'var(--text-1)' }}>{s.instruction}</span>
                          {s.where && <span style={{ color: 'var(--text-2)' }}> — {s.where}</span>}
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {finding.status !== 'pass' && scanId && (
                <div className="flex items-center gap-3">
                  <button onClick={handleVerify} disabled={verifying}
                    className="btn-ghost text-xs px-4 py-2 flex items-center gap-2">
                    <RefreshCw size={12} className={verifying ? 'animate-spin' : ''} />
                    {verifying ? 'Verifying…' : 'VIEW FIX —'}
                  </button>
                  {verifyResult && (
                    <span className={verifyResult.fixed ? 'pill-green' : 'pill-yellow'}>
                      {verifyResult.fixed ? `✓ Fixed! +${verifyResult.points_gained} pts` : verifyResult.message}
                    </span>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
