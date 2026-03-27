import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { useUser, UserButton } from "@clerk/clerk-react"
import { motion, AnimatePresence } from "framer-motion"
import ScoreGauge from "../components/ScoreGauge.jsx"
import Chatbot from "../components/Chatbot.jsx"
import HackerSimulation from "../components/HackerSimulation.jsx"
import FindingCard from "../components/FindingCard.jsx"
import PredictiveThreat from "../components/PredictiveThreat.jsx"
import LivingSecurityScore from "../components/LivingSecurityScore.jsx"
import DamageCalculator from "../components/DamageCalculator.jsx"
import AttackChain from "../components/AttackChain.jsx"
import SecurityCertificate from "../components/SecurityCertificate.jsx"
import { getScanById, getUserProfile, scanDomain } from "../api/secureiq.js"

const SCORE_CATEGORIES = [
  { key: "email", name: "EMAIL SECURITY", max: 30 },
  { key: "ssl", name: "SSL CERTIFICATE", max: 25 },
  { key: "headers", name: "HTTP HEADERS", max: 20 },
  { key: "network", name: "NETWORK", max: 15 },
  { key: "exposure", name: "EXPOSURE", max: 10 },
]

export default function Dashboard() {
  const { user } = useUser()
  const [domain, setDomain] = useState("")
  const [isScanning, setIsScanning] = useState(false)
  const [scanResult, setScanResult] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [error, setError] = useState(null)
  const [activeFilter, setActiveFilter] = useState("all")
  const [scoreFlash, setScoreFlash] = useState(false)
  const prevScore = useRef(null)

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
    prevScore.current = null
    try {
      const cleanedDomain = domain.replace(/https?:\/\/(www\.)?/, "").replace(/\/.*$/, "")
      const result = await scanDomain(cleanedDomain, user?.id || "anon")
      setScanResult(result)
      prevScore.current = result.score
    } catch (e) {
      setError("Scan failed. Check backend is running on port 8000.")
    } finally {
      setIsScanning(false)
    }
  }

  const handleScoreUpdate = async (newScore) => {
    if (!scanResult?.scan_id) return
    try {
      const updated = await getScanById(scanResult.scan_id)
      setScanResult(updated)
      // Trigger flash animation if score improved
      if (updated.score !== prevScore.current) {
        setScoreFlash(true)
        prevScore.current = updated.score
        setTimeout(() => setScoreFlash(false), 2000)
      }
    } catch (e) {}
  }

  const filteredFindings = scanResult?.findings?.filter((finding) => {
    if (activeFilter === "all") return true
    return finding.status === activeFilter
  }) || []

  const fallbackProfile = userProfile || {
    website_type: "other",
    monthly_visitors: "1000_to_10000",
    has_payment_processing: false,
  }

  return (
    <div
      style={{
        background: "#181818",
        minHeight: "100vh",
        paddingTop: "56px",
      }}
    >
      <nav
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: "56px",
          borderBottom: "1px solid #35211A",
          background: "rgba(24,24,24,0.96)",
          backdropFilter: "blur(10px)",
          zIndex: 100,
          padding: "0 24px",
          display: "flex",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px", width: "100%" }}>
          <Link
            to="/"
            style={{
              fontFamily: "'Clash Grotesk', sans-serif",
              fontSize: "18px",
              color: "#EBDCC4",
              fontWeight: "700",
            }}
          >
            SecureIQ
          </Link>

          <div style={{ flex: 1, maxWidth: "720px", display: "flex", alignItems: "center", gap: "12px" }}>
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleScan()}
              placeholder="Enter domain -"
              style={{
                width: "100%",
                border: "none",
                borderBottom: "1px solid #66473B",
                padding: "10px 0",
                color: "#EBDCC4",
                outline: "none",
                fontFamily: "'General Sans', sans-serif",
                fontSize: "13px",
              }}
            />
            <button
              onClick={handleScan}
              style={{
                background: "#DC9F85",
                border: "none",
                borderRadius: "4px",
                padding: "10px 16px",
                color: "#181818",
                fontFamily: "'General Sans', sans-serif",
                fontSize: "11px",
                fontWeight: "700",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              {isScanning ? "Scanning" : "Scan -"}
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <Link
              to="/phishing-detector"
              style={{
                border: "1px solid #35211A",
                borderRadius: "4px",
                padding: "8px 12px",
                color: "#B6A596",
                fontFamily: "'General Sans', sans-serif",
                fontSize: "11px",
                fontWeight: "600",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              Phishing Analyzer -
            </Link>
            <span style={{ color: "#B6A596", fontSize: "11px", fontWeight: "600", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              {user?.firstName || "Operator"}
            </span>
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
      </nav>

      <main style={{ maxWidth: "1200px", margin: "0 auto", padding: "32px 24px 96px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #35211A", paddingBottom: "16px", gap: "16px" }}>
          <div>
            <p style={{ color: "#DC9F85", fontSize: "11px", fontWeight: "600", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "6px" }}>
              - Domain Intelligence
            </p>
            <p style={{ color: "#B6A596", fontSize: "13px", lineHeight: "1.6" }}>
              Scanning for {(userProfile?.website_type || "business").toUpperCase()} infrastructure and exposure paths.
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ color: "#B6A596", fontSize: "11px", fontWeight: "600", letterSpacing: "0.1em", textTransform: "uppercase" }}>Security Score</p>
            <motion.p
              key={scanResult?.score}
              animate={scoreFlash ? { scale: [1, 1.18, 1], color: ["#DC9F85", "#4ade80", "#DC9F85"] } : {}}
              transition={{ duration: 0.6 }}
              style={{ color: "#DC9F85", fontSize: "28px", fontWeight: "700" }}
            >
              {scanResult?.score ?? "--"}
            </motion.p>
          </div>
        </div>

        {error && (
          <p style={{ color: "#DC9F85", fontSize: "12px", fontWeight: "600", marginTop: "16px" }}>{error}</p>
        )}

        {!scanResult && !isScanning && (
          <div className="card" style={{ marginTop: "32px" }}>
            <h2 style={{ fontSize: "clamp(28px, 4vw, 46px)", marginBottom: "12px", color: "#EBDCC4" }}>Ready To Scan</h2>
            <p style={{ color: "#B6A596", lineHeight: "1.7" }}>Enter a domain above to start your security scan.</p>
          </div>
        )}

        {scanResult && (
          <div style={{ marginTop: "32px", display: "grid", gap: "32px" }}>

            {/* ===== PLAIN-ENGLISH SUMMARY CARD ===== */}
            {scanResult.summary && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                style={{
                  background: "rgba(220,159,133,0.06)",
                  border: "1px solid rgba(220,159,133,0.2)",
                  borderRadius: "16px",
                  padding: "20px 24px",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                  <span style={{ fontSize: "24px", lineHeight: 1 }}>🛡️</span>
                  <div>
                    <p style={{ color: "#DC9F85", fontSize: "11px", fontWeight: "700", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "8px" }}>
                      What This Means For Your Business
                    </p>
                    <p style={{ color: "#EBDCC4", fontSize: "14px", lineHeight: "1.7", margin: 0 }}>
                      {scanResult.summary}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "24px" }} className="dashboard-two-col">
              <div className="card">
                <ScoreGauge score={scanResult.score} />
                <div style={{ marginTop: "24px" }}>
                  {SCORE_CATEGORIES.map((category) => {
                    const earned = scanResult.score_breakdown?.[category.key]?.earned || 0
                    return (
                      <div
                        key={category.key}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "10px 0",
                          borderBottom: "1px solid #35211A",
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "'General Sans', sans-serif",
                            fontSize: "11px",
                            fontWeight: "500",
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            color: "#B6A596",
                          }}
                        >
                          {category.name}
                        </span>
                        <span
                          style={{
                            fontFamily: "monospace",
                            fontSize: "13px",
                            color: "#DC9F85",
                            fontWeight: "600",
                          }}
                        >
                          {earned}/{category.max}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="card">
                <p style={{ color: "#DC9F85", fontSize: "11px", fontWeight: "600", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "16px" }}>
                  - Score Breakdown
                </p>
                {SCORE_CATEGORIES.map((category) => {
                  const earned = scanResult.score_breakdown?.[category.key]?.earned || 0
                  const percent = Math.round((earned / category.max) * 100)
                  const barColor = earned < category.max * 0.4 ? "#DC9F85" : earned < category.max * 0.7 ? "#B6A596" : "#66473B"
                  return (
                    <div key={category.key} style={{ padding: "12px 0", borderBottom: "1px solid #35211A" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <p style={{ color: "#B6A596", fontSize: "11px", fontWeight: "600", letterSpacing: "0.08em", textTransform: "uppercase" }}>{category.name}</p>
                        <p style={{ color: "#DC9F85", fontFamily: "monospace", fontSize: "13px", fontWeight: "600" }}>{earned}/{category.max}</p>
                      </div>
                      <div style={{ height: "2px", background: "#35211A", marginTop: "10px" }}>
                        <div style={{ width: `${percent}%`, height: "2px", background: barColor }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            <SecurityCertificate
              scanId={scanResult.scan_id}
              domain={scanResult.domain}
              score={scanResult.score}
            />

            <PredictiveThreat scanResult={scanResult} userProfile={fallbackProfile} />

            <LivingSecurityScore scanResult={scanResult} />

            <DamageCalculator
              scanResult={scanResult}
              userProfile={userProfile || {
                website_type: "other",
                monthly_visitors: "1000_to_10000",
                has_payment_processing: false,
              }}
            />

            <AttackChain chain={scanResult.attack_chain} />

            <HackerSimulation scanResult={scanResult} userProfile={fallbackProfile} />

            <section>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", gap: "16px", flexWrap: "wrap" }}>
                <p style={{ color: "#DC9F85", fontSize: "11px", fontWeight: "600", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                  - Security Findings
                </p>
                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                  {[
                    ["all", `All ${scanResult.findings?.length || 0}`],
                    ["critical", `Critical ${scanResult.critical_count || 0}`],
                    ["warning", `Warning ${scanResult.warning_count || 0}`],
                    ["pass", `Passed ${scanResult.pass_count || 0}`],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setActiveFilter(key)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: activeFilter === key ? "#DC9F85" : "#B6A596",
                        fontFamily: "'General Sans', sans-serif",
                        fontSize: "11px",
                        fontWeight: "600",
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        cursor: "pointer",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: "grid", gap: "12px" }}>
                {filteredFindings.map((finding, index) => (
                  <FindingCard
                    key={`${finding.check}-${index}`}
                    finding={finding}
                    scanId={scanResult.scan_id}
                    domain={scanResult.domain}
                    scanResult={scanResult}
                    userProfile={userProfile}
                    onScoreUpdate={handleScoreUpdate}
                  />
                ))}
              </div>
            </section>
          </div>
        )}
      </main>

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

      <style>{`
        @media (max-width: 900px) {
          .dashboard-two-col {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}
