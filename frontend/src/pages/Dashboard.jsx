import { useState, useEffect } from 'react'
import { useUser, UserButton } from '@clerk/clerk-react'
import { Link } from 'react-router-dom'
import ScoreGauge from '../components/ScoreGauge.jsx'
import Chatbot from '../components/Chatbot.jsx'
import HackerSimulation from '../components/HackerSimulation.jsx'
import FindingCard from '../components/FindingCard.jsx'
import PredictiveThreat from '../components/PredictiveThreat.jsx'
import LivingSecurityScore from '../components/LivingSecurityScore.jsx'
import { scanDomain, getUserProfile, getScanById } from '../api/secureiq.js'

export default function Dashboard() {
  const { user } = useUser()
  const [domain, setDomain] = useState('')
  const [isScanning, setIsScanning] = useState(false)
  const [scanResult, setScanResult] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [error, setError] = useState(null)
  const [activeFilter, setActiveFilter] = useState('all')
  const [displayRisk, setDisplayRisk] = useState(0)

  useEffect(() => {
    if (user) {
      getUserProfile(user.id).then(setUserProfile).catch(() => {})
    }
  }, [user])

  const handleScan = async () => {
    if (!domain.trim()) return
    setIsScanning(true)
    setError(null)
    setScanResult(null)
    try {
      const d = domain.replace(/https?:\/\/(www\.)?/, '').replace(/\/.*$/, '')
      const result = await scanDomain(d, user?.id || 'anon')
      setScanResult(result)
    } catch (e) {
      setError('Scan failed. Check backend is running on port 8000.')
    }
    setIsScanning(false)
  }

  const handleScoreUpdate = async () => {
    // Re-fetch the scan so score + financial exposure update live.
    if (!scanResult?.scan_id) return
    try {
      const updated = await getScanById(scanResult.scan_id)
      setScanResult(updated)
    } catch (e) {}
  }

  useEffect(() => {
    if (!scanResult?.damage?.total_financial_risk) return
    const target = scanResult.damage.total_financial_risk
    const duration = 1200
    let rafId = 0
    let start = 0
    const easeOutExpo = x => (x === 1 ? 1 : 1 - 2 ** (-10 * x))
    const tick = ts => {
      if (!start) start = ts
      const p = Math.min((ts - start) / duration, 1)
      setDisplayRisk(Math.floor(target * easeOutExpo(p)))
      if (p < 1) rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [scanResult])

  // Note: the threat simulation UI is handled entirely by <HackerSimulation />

  const filteredFindings = scanResult?.findings?.filter(f => {
    if (activeFilter === 'all') return true
    return f.status === activeFilter
  }) || []

  const scoreCategories = [
    { key: 'email', label: 'EMAIL SECURITY', max: 30 },
    { key: 'ssl', label: 'SSL CERTIFICATE', max: 25 },
    { key: 'headers', label: 'HTTP HEADERS', max: 20 },
    { key: 'network', label: 'NETWORK', max: 15 },
    { key: 'exposure', label: 'EXPOSURE', max: 10 },
  ]

  return (
    <div className="min-h-screen" style={{ background: '#181818' }}>
      <nav className="h-14 border-b px-12 flex items-center" style={{ borderColor: '#35211A', background: '#181818' }}>
        <div className="w-full flex items-center gap-6">
          <Link to="/" className="label-sm">SECUREIQ</Link>
          <div className="flex-1 max-w-2xl flex items-center gap-3">
            <input
              className="w-full bg-transparent py-2 outline-none"
              style={{ borderBottom: '1px solid #66473B', color: '#EBDCC4' }}
              placeholder="ENTER DOMAIN -"
              value={domain}
              onChange={e => setDomain(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleScan()}
            />
            <button onClick={handleScan} className="btn-primary">{isScanning ? 'SCANNING' : 'SCAN -'}</button>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="label-sm">- {user?.firstName || 'OPERATOR'}</span>
            <Link
              to="/phishing-detector"
              className="btn-ghost"
              style={{
                border: '1px solid #35211A',
                padding: '6px 10px',
                borderRadius: '4px',
                color: '#B6A596',
                textDecoration: 'none',
                fontFamily: "'General Sans', sans-serif",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              Phishing Analyzer -
            </Link>
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-12 py-10">
        <div className="flex items-center justify-between border-b pb-4" style={{ borderColor: '#35211A' }}>
          <p className="label-sm">SCANNING FOR {(userProfile?.website_type || 'BUSINESS').toUpperCase()} INFRASTRUCTURE</p>
          <p className="label-sm"><span style={{ color: '#DC9F85' }}>{scanResult?.score ?? '--'}</span> <span style={{ color: '#35211A' }}>- SCORE</span></p>
        </div>

        {error && <p className="label-sm mt-4" style={{ color: '#DC9F85' }}>{error}</p>}

        {scanResult && (
          <div className="mt-10 space-y-12">
            <section className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="pr-6 md:border-r" style={{ borderColor: '#35211A' }}>
                <ScoreGauge score={scanResult.score} />
                <div className="mt-8 space-y-2" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                  {scoreCategories.map(cat => {
                    const earned = scanResult.score_breakdown?.[cat.key]?.earned || 0
                    return <p key={cat.key} className="label-sm">{`${cat.label} -------------- ${String(earned).padStart(2, '0')} / ${cat.max}`}</p>
                  })}
                </div>
              </div>
              <div>
                {scoreCategories.map(cat => {
                  const earned = scanResult.score_breakdown?.[cat.key]?.earned || 0
                  const pct = Math.round((earned / cat.max) * 100)
                  const color = earned < cat.max * 0.4 ? '#DC9F85' : earned < cat.max * 0.7 ? '#B6A596' : '#66473B'
                  return (
                    <div key={cat.key} className="py-3 border-b" style={{ borderColor: '#35211A' }}>
                      <div className="flex justify-between">
                        <p className="label-sm">{cat.label}</p>
                        <p className="label-sm">{earned}/{cat.max}</p>
                      </div>
                      <div className="h-px mt-2" style={{ background: '#35211A' }}>
                        <div className="h-px" style={{ width: `${pct}%`, background: color }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            <PredictiveThreat scanResult={scanResult} userProfile={userProfile} />

            <LivingSecurityScore scanResult={scanResult} />

            <section className="border-t pt-8" style={{ borderColor: '#35211A' }}>
              <p className="label-accent mb-6">- FINANCIAL EXPOSURE ANALYSIS</p>
              <p className="display-lg" style={{ color: '#DC9F85' }}>
                ₹{displayRisk.toLocaleString('en-IN')}
              </p>
              <p className="label-sm mb-6">TOTAL RISK EXPOSURE</p>
              <div className="border-b pb-2 mb-2 grid grid-cols-3" style={{ borderColor: '#35211A' }}>
                <p className="label-sm" style={{ color: '#35211A' }}>VULNERABILITY</p>
                <p className="label-sm" style={{ color: '#35211A' }}>EXPOSURE</p>
                <p className="label-sm" style={{ color: '#35211A' }}>STATUS</p>
              </div>
              {(scanResult.damage?.finding_costs || []).map((fc, idx) => (
                <div key={`${fc.check || 'item'}-${idx}`} className="grid grid-cols-3 py-3 border-b" style={{ borderColor: '#35211A' }}>
                  <p className="label-sm">{fc.label || fc.check}</p>
                  <p className="label-sm" style={{ color: '#DC9F85' }}>{fc.formatted_cost}</p>
                  <p className={`status-dot ${fc.status === 'critical' ? 'critical' : 'warning'} label-sm`}>ACTIVE</p>
                </div>
              ))}
            </section>

            <HackerSimulation scanResult={scanResult} userProfile={userProfile} />

            <section>
              <div className="flex items-center justify-between">
                <p className="label-accent">- SECURITY FINDINGS</p>
                <div className="label-sm flex gap-4">
                  {[
                    ['all', `ALL ${scanResult.findings?.length || 0}`],
                    ['critical', `CRITICAL ${scanResult.critical_count || 0}`],
                    ['warning', `WARNING ${scanResult.warning_count || 0}`],
                    ['pass', `PASSED ${scanResult.pass_count || 0}`],
                  ].map(([key, label]) => (
                    <button key={key} onClick={() => setActiveFilter(key)} className="label-sm" style={{ textDecoration: activeFilter === key ? 'underline' : 'none', textDecorationColor: '#DC9F85' }}>{label} -</button>
                  ))}
                </div>
              </div>
              <div className="divider my-4" />
              <div className="space-y-3">
                {filteredFindings.map((f, idx) => (
                  <FindingCard
                    key={`${f.check}-${idx}`}
                    finding={f}
                    scanId={scanResult.scan_id}
                    domain={scanResult.domain}
                    scanResult={scanResult}
                    onScoreUpdate={handleScoreUpdate}
                  />
                ))}
              </div>
            </section>

            {scanResult.attack_chain?.has_chain && (
              <section>
                <div className="flex justify-between mb-4">
                  <p className="label-accent">- ATTACK CHAIN DETECTED</p>
                  <p className="label-sm" style={{ color: '#DC9F85' }}>CHAIN SEVERITY - CRITICAL</p>
                </div>
                <h3 className="display-md headline-depth" data-text={scanResult.attack_chain.title || 'MULTI-STEP EXPLOIT CHAIN'}>
                  <span>{scanResult.attack_chain.title || 'MULTI-STEP EXPLOIT CHAIN'}</span>
                </h3>
              </section>
            )}

            <section>
              <p className="label-accent mb-4">- SECURITY CERTIFICATE</p>
              {(scanResult.score || 0) < 70 ? (
                <>
                  <p className="label-sm" style={{ color: '#66473B' }}>LOCKED - SCORE REQUIREMENT: 70/100</p>
                  <p className="label-sm mt-2">CURRENT: {scanResult.score} --------------- REQUIRED: 70</p>
                </>
              ) : (
                <div className="card" style={{ borderColor: '#DC9F85' }}>
                  <p className="label-sm text-center">CERTIFICATE OF SECURITY COMPLIANCE</p>
                  <p className="display-md text-center mt-3" style={{ color: '#DC9F85' }}>{scanResult.domain}</p>
                  <p className="display-lg text-center">{scanResult.score}</p>
                  <div className="grid grid-cols-3 mt-6 mb-6">
                    <div><p className="label-sm" style={{ color: '#35211A' }}>CERT_ID</p><p className="label-sm">{scanResult.scan_id}</p></div>
                    <div><p className="label-sm" style={{ color: '#35211A' }}>VALID_UNTIL</p><p className="label-sm">12 MONTHS</p></div>
                    <div><p className="label-sm" style={{ color: '#35211A' }}>VERIFIED_BY</p><p className="label-sm">SECUREIQ</p></div>
                  </div>
                  <div className="divider mb-4" />
                  <Link to={`/report/${scanResult.scan_id}`} className="btn-primary block text-center">DOWNLOAD CERTIFICATE -</Link>
                </div>
              )}
            </section>
          </div>
        )}

        {!scanResult && !isScanning && (
          <div className="mt-12 card">
            <h2 className="display-md headline-depth" data-text="READY TO SCAN"><span>READY TO SCAN</span></h2>
            <p className="body-copy mt-4">Enter a domain above to start your security scan.</p>
          </div>
        )}
      </div>

      <Chatbot
        scanContext={
          scanResult
            ? {
                domain: scanResult.domain,
                score: scanResult.score,
                critical_count: scanResult.critical_count,
                warning_count: scanResult.warning_count,
              }
            : {}
        }
      />
    </div>
  )
}
