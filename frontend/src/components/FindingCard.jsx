import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Copy, Check, Loader, CheckCircle, AlertCircle } from 'lucide-react'
import { deployAutoFixGoDaddy, generateAutoFix, verifyAutoFix, verifyFix } from '../api/secureiq.js'

// autoFixPhase: idle | loading | steps_shown | verifying | fixed | failed
export default function FindingCard({ finding, scanId, domain, scanResult, userProfile, onScoreUpdate }) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(null)
  const [autoFixPhase, setAutoFixPhase] = useState('idle')
  const [generatedRecord, setGeneratedRecord] = useState(null)
  const [autoFixMessage, setAutoFixMessage] = useState('')
  const [pointsGained, setPointsGained] = useState(0)
  const [deployingProvider, setDeployingProvider] = useState('')

  const fix = finding.fixes || {}
  const borderColor = { critical: 'var(--red)', warning: 'var(--yellow)', pass: 'var(--green)', info: 'var(--blue)' }[finding.status] || 'var(--border)'
  const isDnsFinding = ['SPF Record', 'DMARC Policy', 'DKIM Signing'].some(
    c => String(c).toLowerCase() === String(finding.check).toLowerCase()
  )
  const isFixable = finding.status !== 'pass' && finding.status !== 'info'
  const providerHint = String(
    userProfile?.hosting_provider ||
    scanResult?.hosting_provider ||
    scanResult?.hostingProvider ||
    ''
  )
  const canDeployGoDaddy = /godaddy/i.test(providerHint)

  const copy = (text, key) => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  // Step 1: Load steps — DNS findings use backend, others use fix_generator data
  const handleShowSteps = async () => {
    if (!isFixable) return
    if (autoFixPhase === 'loading' || autoFixPhase === 'verifying') return

    setAutoFixPhase('loading')
    setGeneratedRecord(null)
    setAutoFixMessage('')

    if (isDnsFinding && scanId) {
      // DNS path — generate record + human steps via backend AI
      try {
        const hostingProvider = scanResult?.hosting_provider || scanResult?.hostingProvider || 'unknown'
        const emailProvider = scanResult?.email_provider || scanResult?.emailProvider || 'google'
        const record = await generateAutoFix({
          check_name: finding.check,
          domain,
          hosting_provider: hostingProvider,
          email_provider: emailProvider,
        })
        if (record?.error) {
          setAutoFixPhase('failed')
          setAutoFixMessage('Could not generate fix steps. Please try again.')
          return
        }
        setGeneratedRecord(record)
        setAutoFixPhase('steps_shown')
      } catch (e) {
        setAutoFixPhase('failed')
        setAutoFixMessage('Something went wrong generating fix steps.')
      }
    } else {
      // Non-DNS path — use fix_generator steps (already in scan data via `finding.fixes`)
      const steps = fix.steps || []
      const humanSteps = steps.length > 0
        ? steps.map(s => s.instruction + (s.where ? ` (${s.where})` : ''))
        : [
            `Log in to your hosting or server control panel.`,
            `Find the settings section related to "${finding.check}".`,
            finding.fix_preview || `Apply the recommended fix for this issue.`,
            `Save the changes and wait a few minutes for them to take effect.`,
            `Come back to SecureIQ and scan again to verify your score improved.`,
          ]

      setGeneratedRecord({
        human_steps: humanSteps,
        record_value: fix.exact_value || null,
        record_type: null,
        record_name: null,
        time_estimate: fix.time_estimate || null,
        is_non_dns: true,
      })
      setAutoFixPhase('steps_shown')
    }
  }

  // Step 2: User confirms → verify (DNS only)
  const handleConfirmFixed = async () => {
    if (!generatedRecord || autoFixPhase === 'verifying') return

    if (generatedRecord.is_non_dns) {
      // Non-DNS: verify what we can, then refresh scan so score updates live
      setAutoFixPhase('verifying')
      setAutoFixMessage('')
      try {
        if (scanId) {
          const res = await verifyFix(scanId, finding.check, domain)
          const fixed = !!res?.fixed
          if (fixed) {
            setAutoFixPhase('fixed')
            setPointsGained(res.points_gained || 0)
            setAutoFixMessage(res.message || 'Fix verified!')
          } else {
            setAutoFixPhase('fixed')
            setAutoFixMessage(res?.message || 'Changes noted. Refreshing your score…')
          }
        } else {
          setAutoFixPhase('fixed')
          setAutoFixMessage('Changes noted. Refreshing your score…')
        }
      } catch (e) {
        setAutoFixPhase('fixed')
        setAutoFixMessage('Changes noted. Refreshing your score…')
      } finally {
        onScoreUpdate?.()
      }
      return
    }

    setAutoFixPhase('verifying')
    setAutoFixMessage('')
    try {
      const res = await verifyAutoFix({
        domain,
        check_name: finding.check,
        expected_value: generatedRecord?.record_value || '',
        scan_id: scanId,
      })
      if (res?.verified) {
        setAutoFixPhase('fixed')
        setPointsGained(res.points_gained || 0)
        setAutoFixMessage(res.message || 'Fix verified!')
        onScoreUpdate?.()
      } else {
        setAutoFixPhase('steps_shown')
        setAutoFixMessage(res?.message || 'The change wasn\'t detected yet — DNS changes can take up to 60 minutes. Try again shortly.')
      }
    } catch (e) {
      setAutoFixPhase('steps_shown')
      setAutoFixMessage('Verification failed. Please wait a few minutes and try again.')
    }
  }

  const resetAutoFix = () => {
    setAutoFixPhase('idle')
    setGeneratedRecord(null)
    setAutoFixMessage('')
    setPointsGained(0)
    setDeployingProvider('')
  }

  const handleDeployGoDaddy = async () => {
    if (!generatedRecord?.record_value || deployingProvider) return
    setDeployingProvider('godaddy')
    setAutoFixMessage('')
    try {
      const res = await deployAutoFixGoDaddy({
        domain,
        check_name: finding.check,
        record_type: generatedRecord.record_type || 'TXT',
        record_name: generatedRecord.record_name || '@',
        record_value: generatedRecord.record_value,
        ttl: generatedRecord.ttl || 600,
      })
      if (res?.deployed) {
        setAutoFixMessage(`${res.message} DNS propagation can still take a few minutes. Then click "Update My Score".`)
      } else {
        setAutoFixMessage(res?.message || 'GoDaddy deployment failed. Use the manual steps below.')
      }
    } catch (e) {
      setAutoFixMessage('GoDaddy deployment failed. Use the manual steps below or check backend credentials.')
    } finally {
      setDeployingProvider('')
    }
  }

  return (
    <motion.div
      layout
      className="rounded-2xl border overflow-hidden"
      style={{
        borderLeft: `3px solid ${borderColor}`,
        borderTop: '1px solid var(--border)',
        borderRight: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-card)',
      }}
    >
      {/* Header row — always visible */}
      <button
        className="w-full p-4 flex items-center gap-3 text-left"
        onClick={() => setExpanded(e => !e)}
        style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
      >
        <span
          style={{
            fontSize: '11px', fontWeight: '700', letterSpacing: '0.1em',
            textTransform: 'uppercase', flexShrink: 0,
            color: finding.status === 'pass'
              ? 'var(--green)'
              : finding.status === 'warning'
                ? 'var(--yellow)'
                : finding.status === 'info'
                  ? 'var(--blue)'
                  : 'var(--red)',
          }}
        >
          {finding.status === 'pass'
            ? '✓'
            : finding.status === 'warning'
              ? '⚠'
              : finding.status === 'info'
                ? 'ℹ'
                : '✕'} {finding.status}
        </span>
        <div className="flex-1 min-w-0">
          <p style={{ color: '#EBDCC4', fontSize: '13px', fontWeight: '600', marginBottom: 2 }}>
            {finding.check}
          </p>
          <p style={{ color: '#B6A596', fontSize: '12px' }} className="truncate">
            {finding.explanation || finding.detail}
          </p>
        </div>
        <ChevronDown
          size={16}
          style={{
            color: '#B6A596',
            transform: expanded ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s',
            flexShrink: 0,
          }}
        />
      </button>

      {/* Expanded body */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>

              {/* Plain-English Explanation */}
              <div style={{ paddingTop: 16 }}>
                <p style={{ color: '#B6A596', fontSize: '13px', lineHeight: 1.7 }}>
                  {finding.explanation || finding.detail}
                </p>
                {finding.india_context && (
                  <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                    <p style={{ color: 'var(--yellow)', fontSize: '12px' }}>🇮🇳 {finding.india_context}</p>
                  </div>
                )}
              </div>

              {/* What needs to be done */}
              {finding.fix_preview && finding.status !== 'pass' && (
                <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.15)' }}>
                  <p style={{ color: 'var(--blue)', fontSize: '11px', fontWeight: '700', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    🔧 What needs to be done
                  </p>
                  <p style={{ color: '#B6A596', fontSize: '12px' }}>{finding.fix_preview}</p>
                </div>
              )}

              {/* ====== AUTO-FIX SECTION ====== */}
              {isFixable && (
                <div style={{ marginTop: 16 }}>

                  {/* FIXED */}
                  {autoFixPhase === 'fixed' && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      style={{ padding: '16px', borderRadius: 12, textAlign: 'center', background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)' }}
                    >
                      <CheckCircle size={28} style={{ color: 'var(--green)', margin: '0 auto 8px' }} />
                      <p style={{ color: 'var(--green)', fontSize: '14px', fontWeight: '700' }}>
                        {generatedRecord?.is_non_dns ? 'Steps Completed! 🎉' : 'Fix Verified! 🎉'}
                      </p>
                      {pointsGained > 0 && (
                        <p style={{ color: '#B6A596', fontSize: '12px', marginTop: 4 }}>+{pointsGained} points added to your score</p>
                      )}
                      {autoFixMessage && (
                        <p style={{ color: '#B6A596', fontSize: '12px', marginTop: 6 }}>{autoFixMessage}</p>
                      )}
                      <button onClick={resetAutoFix} style={{ color: 'var(--text-2)', fontSize: '11px', marginTop: 12, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                        Show steps again
                      </button>
                    </motion.div>
                  )}

                  {/* IDLE — Show the button */}
                  {autoFixPhase === 'idle' && (
                    <button
                      onClick={handleShowSteps}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        fontSize: '12px', fontWeight: '700', letterSpacing: '0.05em',
                        padding: '10px 16px', borderRadius: 8, cursor: 'pointer',
                        background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.25)',
                        color: 'var(--blue)',
                      }}
                    >
                      🔧 Show me how to fix this
                    </button>
                  )}

                  {/* LOADING */}
                  {autoFixPhase === 'loading' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#B6A596', fontSize: '12px' }}>
                      <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
                      Generating fix steps…
                    </div>
                  )}

                  {/* STEPS_SHOWN / VERIFYING */}
                  {(autoFixPhase === 'steps_shown' || autoFixPhase === 'verifying') && generatedRecord && (
                    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'grid', gap: 14 }}>

                      {/* Header */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <p style={{ color: 'var(--blue)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                          📋 Steps to fix this
                        </p>
                        <button onClick={resetAutoFix} style={{ color: 'var(--text-2)', fontSize: '11px', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                          Cancel
                        </button>
                      </div>

                      {/* Numbered plain-English steps */}
                      {generatedRecord.human_steps?.length > 0 && (
                        <ol style={{ display: 'grid', gap: 10, listStyle: 'none', padding: 0, margin: 0 }}>
                          {generatedRecord.human_steps.map((step, i) => (
                            <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                              <span style={{
                                flexShrink: 0, width: 24, height: 24, borderRadius: '50%', display: 'flex',
                                alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700',
                                background: 'rgba(96,165,250,0.15)', color: 'var(--blue)',
                              }}>
                                {i + 1}
                              </span>
                              <span style={{ color: '#EBDCC4', fontSize: '13px', lineHeight: 1.6 }}>{step}</span>
                            </li>
                          ))}
                        </ol>
                      )}

                      {/* DNS record value to copy (DNS findings only) */}
                      {!generatedRecord.is_non_dns && generatedRecord.record_value && (
                        <div style={{ padding: 14, borderRadius: 10, background: 'var(--bg-card-2)', border: '1px solid var(--border)' }}>
                          <p style={{ color: '#B6A596', fontSize: '11px', fontWeight: '700', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            📄 The exact value to paste into your DNS panel:
                          </p>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                            <div>
                              <p style={{ color: 'var(--text-2)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>Type</p>
                              <p style={{ color: '#EBDCC4', fontSize: '12px', fontWeight: '600' }}>{generatedRecord.record_type || 'TXT'}</p>
                            </div>
                            <div>
                              <p style={{ color: 'var(--text-2)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>Name / Host</p>
                              <p style={{ color: '#EBDCC4', fontSize: '12px', fontWeight: '600' }}>{generatedRecord.record_name || '@'}</p>
                            </div>
                          </div>
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                              <p style={{ color: 'var(--text-2)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Value (copy this)</p>
                              <button
                                onClick={() => copy(generatedRecord.record_value, 'record')}
                                style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--blue)', fontSize: '11px', background: 'none', border: 'none', cursor: 'pointer' }}
                              >
                                {copied === 'record' ? <Check size={11} /> : <Copy size={11} />}
                                {copied === 'record' ? 'Copied!' : 'Copy'}
                              </button>
                            </div>
                            <div style={{ padding: '10px 12px', borderRadius: 8, background: '#0D1117', border: '1px solid var(--border)', fontFamily: 'monospace', fontSize: '12px', color: 'var(--green)', overflowX: 'auto' }}>
                              {generatedRecord.record_value}
                            </div>
                          </div>
                          {generatedRecord.time_estimate && (
                            <p style={{ color: '#B6A596', fontSize: '11px', marginTop: 10 }}>
                              ⏱ Time needed: {generatedRecord.time_estimate}
                            </p>
                          )}
                          {canDeployGoDaddy && (
                            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                              <p style={{ color: 'var(--text-2)', fontSize: '11px', marginBottom: 10 }}>
                                GoDaddy detected from your setup. You can push this TXT record directly from SecureIQ.
                              </p>
                              <button
                                onClick={handleDeployGoDaddy}
                                disabled={deployingProvider === 'godaddy'}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 8,
                                  width: '100%',
                                  padding: '12px 14px',
                                  borderRadius: 10,
                                  fontSize: '12px',
                                  fontWeight: '700',
                                  background: deployingProvider === 'godaddy' ? 'rgba(220,159,133,0.08)' : 'rgba(220,159,133,0.14)',
                                  border: '1px solid rgba(220,159,133,0.3)',
                                  color: 'var(--accent)',
                                  cursor: deployingProvider === 'godaddy' ? 'not-allowed' : 'pointer',
                                }}
                              >
                                {deployingProvider === 'godaddy' ? (
                                  <>
                                    <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
                                    Deploying to GoDaddy…
                                  </>
                                ) : (
                                  <>GoDaddy One-Click Deploy</>
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Non-DNS exact value */}
                      {generatedRecord.is_non_dns && generatedRecord.record_value && (
                        <div style={{ padding: 12, borderRadius: 10, background: '#0D1117', border: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <p style={{ color: '#B6A596', fontSize: '11px', fontWeight: '700' }}>Exact value to use:</p>
                            <button onClick={() => copy(generatedRecord.record_value, 'exact')} style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--blue)', fontSize: '11px', background: 'none', border: 'none', cursor: 'pointer' }}>
                              {copied === 'exact' ? <Check size={11} /> : <Copy size={11} />}
                              {copied === 'exact' ? 'Copied!' : 'Copy'}
                            </button>
                          </div>
                          <code style={{ color: 'var(--green)', fontFamily: 'monospace', fontSize: '11px', display: 'block', overflowX: 'auto' }}>
                            {generatedRecord.record_value}
                          </code>
                        </div>
                      )}

                      {/* Feedback message */}
                      {autoFixMessage && (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', borderRadius: 10, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                          <AlertCircle size={14} style={{ color: 'var(--yellow)', flexShrink: 0, marginTop: 2 }} />
                          <p style={{ color: 'var(--yellow)', fontSize: '12px', lineHeight: 1.6 }}>{autoFixMessage}</p>
                        </div>
                      )}

                      {/* Confirm button */}
                      <button
                        onClick={handleConfirmFixed}
                        disabled={autoFixPhase === 'verifying'}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          gap: 8, padding: '14px 16px', borderRadius: 10, fontSize: '13px', fontWeight: '700',
                          background: autoFixPhase === 'verifying' ? 'rgba(74,222,128,0.06)' : 'rgba(74,222,128,0.12)',
                          border: '1px solid rgba(74,222,128,0.3)', color: 'var(--green)',
                          cursor: autoFixPhase === 'verifying' ? 'not-allowed' : 'pointer',
                          transition: 'all 0.2s',
                        }}
                      >
                        {autoFixPhase === 'verifying' ? (
                          <>
                            <Loader size={15} style={{ animation: 'spin 1s linear infinite' }} />
                            Checking… this may take a moment
                          </>
                        ) : (
                          <>✅ I've Made These Changes — Update My Score</>
                        )}
                      </button>
                    </motion.div>
                  )}

                  {/* FAILED */}
                  {autoFixPhase === 'failed' && (
                    <div style={{ display: 'grid', gap: 8 }}>
                      {autoFixMessage && <p style={{ color: 'var(--yellow)', fontSize: '12px' }}>{autoFixMessage}</p>}
                      <button
                        onClick={handleShowSteps}
                        style={{ alignSelf: 'start', padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', color: 'var(--blue)', background: 'transparent', fontSize: '12px', cursor: 'pointer' }}
                      >
                        Try again
                      </button>
                    </div>
                  )}
                </div>
              )}

            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </motion.div>
  )
}
