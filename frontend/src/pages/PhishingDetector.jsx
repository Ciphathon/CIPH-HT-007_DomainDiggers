import { useState, useEffect } from 'react'
import { useUser } from '@clerk/clerk-react'
import { Link } from 'react-router-dom'
import { analyzePhishing, analyzeConversation, getPhishingHistory, getPhishingStats } from '../api/secureiq.js'
import ConversationAnalyzer from '../components/ConversationAnalyzer.jsx'
import PsychDimensions from '../components/PsychDimensions.jsx'

const MSG_TYPES = ['Email', 'WhatsApp', 'SMS', 'Other']
const INSTANT_PATTERNS = [
  { pattern: /urgent|immediately|asap|right now|final notice/i, label: 'URGENCY TACTICS', color: '#B6A596' },
  { pattern: /otp|one.time.password|verification code/i, label: 'OTP REQUEST', color: '#DC9F85' },
  { pattern: /whatsapp|telegram|signal|message me/i, label: 'CHANNEL SHIFT ATTEMPT', color: '#DC9F85' },
  { pattern: /cbi|police|cybercrime|arrest|warrant/i, label: 'AUTHORITY IMPERSONATION', color: '#DC9F85' },
]

export default function PhishingDetector() {
  const { user } = useUser()
  const [tab, setTab] = useState('single') // single | thread
  const [msgType, setMsgType] = useState('Email')
  const [senderInfo, setSenderInfo] = useState('')
  const [message, setMessage] = useState('')
  const [conversationText, setConversationText] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState(null)
  const [history, setHistory] = useState([])
  const [stats, setStats] = useState(null)
  const [instantFlags, setInstantFlags] = useState([])
  const [timer, setTimer] = useState(0)
  const [timerActive, setTimerActive] = useState(false)

  useEffect(() => {
    if (user) {
      getPhishingHistory(user.id).then(setHistory).catch(() => {})
      getPhishingStats(user.id).then(setStats).catch(() => {})
    }
  }, [user])

  useEffect(() => {
    const flags = INSTANT_PATTERNS.filter(p => p.pattern.test(message)).map(p => ({ label: p.label, color: p.color }))
    setInstantFlags(flags)
  }, [message])

  useEffect(() => {
    let interval
    if (timerActive) { interval = setInterval(() => setTimer(t => t + 0.1), 100) }
    else { setTimer(0) }
    return () => clearInterval(interval)
  }, [timerActive])

  const analyze = async () => {
    if (!message.trim()) return
    setAnalyzing(true)
    setResult(null)
    setTimerActive(true)
    try {
      const res = await analyzePhishing({
        message_text: message,
        message_type: msgType.toLowerCase(),
        sender_info: senderInfo,
        clerk_user_id: user?.id || 'anon',
      })
      setResult(res)
      getPhishingHistory(user.id).then(setHistory).catch(() => {})
      getPhishingStats(user.id).then(setStats).catch(() => {})
    } catch {
      setResult({ error: true, verdict: 'ERROR', risk_score: 0 })
    }
    setTimerActive(false)
    setAnalyzing(false)
  }

  const analyzeThread = async () => {
    if (!conversationText.trim()) return
    setAnalyzing(true)
    setResult(null)
    setTimerActive(true)
    try {
      const res = await analyzeConversation({
        conversation_text: conversationText,
        message_type: msgType.toLowerCase(),
        sender_info: senderInfo,
        clerk_user_id: user?.id || 'anon',
      })
      setResult(res)
      getPhishingHistory(user.id).then(setHistory).catch(() => {})
      getPhishingStats(user.id).then(setStats).catch(() => {})
    } catch {
      setResult({ error: true, verdict: 'ERROR', risk_score: 0 })
    }
    setTimerActive(false)
    setAnalyzing(false)
  }

  const verdictStyle = v => {
    if (v === 'SAFE') return { bg: 'rgba(182,165,150,0.10)', border: '#B6A596' }
    if (v === 'PHISHING') return { bg: 'rgba(220,159,133,0.10)', border: '#DC9F85' }
    return { bg: 'rgba(220,159,133,0.20)', border: '#DC9F85' }
  }

  return (
    <div className="min-h-screen" style={{ background: '#181818' }}>
      <div className="max-w-6xl mx-auto px-12 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="label-accent">- PHISHING INTELLIGENCE ENGINE</p>
            <h1 className="display-md headline-depth mt-2" data-text={'LOCAL\nAI ANALYSIS'} style={{ whiteSpace: 'pre-line' }}><span>{'LOCAL\nAI ANALYSIS'}</span></h1>
          </div>
          <Link to="/dashboard" className="btn-ghost">BACK TO DASHBOARD</Link>
        </div>

        <div className="mb-8" style={{ borderLeft: '2px solid #DC9F85', paddingLeft: 16 }}>
          <p className="label-sm" style={{ color: '#DC9F85' }}>PROCESSING MODE: LOCAL-ONLY</p>
          <p className="body-copy">Zero bytes transmitted to external servers. All analysis executes on local Ollama instance.</p>
        </div>

        {stats && (
          <div className="grid grid-cols-3 border-y mb-8" style={{ borderColor: '#35211A' }}>
            {[
              ['ANALYZED', stats.total_analyzed],
              ['THREATS', stats.threats_detected],
              ['SAFE', stats.safe_messages],
            ].map(([label, value], index) => (
              <div key={label} className={`py-6 px-4 ${index < 2 ? 'border-r' : ''}`} style={{ borderColor: '#35211A' }}>
                <p className="display-md">{value}</p>
                <p className="label-sm" style={{ color: '#35211A' }}>{label}</p>
              </div>
            ))}
          </div>
        )}

        <div className="grid md:grid-cols-5 gap-8">
          <div className="md:col-span-3">
            <div className="flex gap-4 mb-4">
              <button
                className="label-sm"
                onClick={() => setTab('single')}
                style={{ textDecoration: tab === 'single' ? 'underline' : 'none', textDecorationColor: '#DC9F85' }}
              >
                SINGLE MESSAGE -
              </button>
              <button
                className="label-sm"
                onClick={() => setTab('thread')}
                style={{ textDecoration: tab === 'thread' ? 'underline' : 'none', textDecorationColor: '#DC9F85' }}
              >
                CONVERSATION THREAD -
              </button>
            </div>

            <div className="flex gap-4 mb-4">
              {MSG_TYPES.map(t => (
                <button
                  key={t}
                  className="label-sm"
                  onClick={() => setMsgType(t)}
                  style={{ textDecoration: msgType === t ? 'underline' : 'none', textDecorationColor: '#DC9F85' }}
                >
                  {t.toUpperCase()} -
                </button>
              ))}
            </div>

            {tab === 'single' && (
              <>
                <p className="label-sm mb-2">FROM:</p>
                <input className="input-field mb-4" value={senderInfo} onChange={e => setSenderInfo(e.target.value)} />
                <p className="label-sm mb-2">MESSAGE:</p>
                <textarea
                  className="input-field"
                  style={{ minHeight: 240, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                />
                <p className="label-sm mt-4 mb-2" style={{ color: '#35211A' }}>DETECTED PATTERNS:</p>
                <div className="flex flex-wrap gap-2">
                  {instantFlags.map(f => (
                    <span key={f.label} className="label-sm px-2 py-1" style={{ border: `1px solid ${f.color}`, borderRadius: 2, color: f.color }}>
                      {f.label}
                    </span>
                  ))}
                </div>
                <button className="btn-primary w-full mt-6" onClick={analyze} disabled={analyzing || !message.trim()}>ANALYZE -</button>
                {analyzing && <p className="label-sm mt-3">RUNNING LOCAL AI ANALYSIS - <span style={{ color: '#DC9F85' }}>{timer.toFixed(1)}s</span></p>}
              </>
            )}

            {tab === 'thread' && (
              <>
                <p className="label-sm mb-2">FROM (optional):</p>
                <input className="input-field mb-4" value={senderInfo} onChange={e => setSenderInfo(e.target.value)} />
                <p className="label-sm mb-2">CONVERSATION THREAD:</p>
                <textarea
                  className="input-field"
                  placeholder={`Examples:\nCREDIBLE SUPPORT: Your account will be suspended.\nSCAM BOT: Act now and move to WhatsApp.\nHR DEPT: Transfer funds immediately.`}
                  style={{ minHeight: 240, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                  value={conversationText}
                  onChange={e => setConversationText(e.target.value)}
                />
                <button className="btn-primary w-full mt-6" onClick={analyzeThread} disabled={analyzing || !conversationText.trim()}>
                  ANALYZE THREAD -
                </button>
                {analyzing && <p className="label-sm mt-3">RUNNING LOCAL AI ANALYSIS - <span style={{ color: '#DC9F85' }}>{timer.toFixed(1)}s</span></p>}
              </>
            )}
          </div>

          <div className="md:col-span-2">
            {!result && <div className="card"><p className="body-copy">Verdict panel will appear after analysis.</p></div>}
            {result && !result.error && tab === 'thread' && (
              <ConversationAnalyzer analysis={result} />
            )}
            {result && !result.error && tab === 'single' && (
              <div className="space-y-4">
                <div className="p-4 border" style={{ background: verdictStyle(result.verdict).bg, borderColor: verdictStyle(result.verdict).border, borderRadius: 4 }}>
                  <p className="label-sm mb-2">VERDICT HEADER</p>
                  <p className="display-md">{result.risk_score} <span className="label-sm">/ 100</span></p>
                  <p className="display-md">VERDICT: {result.verdict}</p>
                </div>

                <div className="card">
                  <p className="label-accent mb-2">SOFT-POWER ANALYSIS</p>
                  {(result.manipulation_techniques || []).slice(0, 3).map((t, i) => (
                    <div key={`${t.technique}-${i}`} className="mb-4">
                      <p className="label-sm" style={{ color: '#DC9F85' }}>{String(i + 1).padStart(2, '0')} - {t.technique}</p>
                      {t.evidence && <code style={{ display: 'block', marginTop: 6, background: '#0D0D0D', border: '1px solid #35211A', padding: 10, color: '#DC9F85' }}>{t.evidence}</code>}
                      <p className="body-copy">{t.explanation}</p>
                    </div>
                  ))}
                  {result.india_specific_scam && (
                    <p className="label-sm px-3 py-2 mt-2" style={{ color: '#EBDCC4', background: 'rgba(220,159,133,0.2)', border: '1px solid #DC9F85', borderRadius: 4 }}>
                      KNOWN PATTERN: {result.india_specific_scam}
                    </p>
                  )}
                </div>

                {result.psychological_dimensions && result.psychological_dimensions.length > 0 && (
                  <PsychDimensions dimensions={result.psychological_dimensions} />
                )}

                <button className={result.recommended_action === 'REPORT' ? 'btn-danger w-full' : 'btn-primary w-full'}>
                  {result.recommended_action === 'REPORT' ? 'REPORT THIS THREAT -' : 'SAFE RESPONSE -'}
                </button>
              </div>
            )}
          </div>
        </div>

        {history.length > 0 && (
          <div className="mt-12">
            <p className="label-accent mb-4">- ANALYSIS HISTORY</p>
            <div className="space-y-0">
              {history.map(h => (
                <div key={h.id} className="py-3 border-b grid grid-cols-12 gap-2" style={{ borderColor: '#35211A' }}>
                  <p className="label-sm col-span-2">{h.verdict}</p>
                  <p className="label-sm col-span-2">{h.message_type}</p>
                  <p className="body-copy col-span-6">{h.message_preview}</p>
                  <p className="label-sm col-span-2 text-right">{new Date(h.analyzed_at).toLocaleDateString('en-IN')}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
