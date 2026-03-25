import { useState, useRef, useEffect } from "react"
import { useUser } from "@clerk/clerk-react"
import { sendChatMessage } from "../api/secureiq.js"

export default function Chatbot({ scanContext }) {
  const { user } = useUser()
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: "assistant",
      text: "I have analyzed your domain. Ask me anything about your security findings, which issues to fix first, or how to apply any fix.",
      timestamp: new Date().toISOString()
    }
  ])
  const [inputValue, setInputValue] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  // Auto scroll to bottom whenever messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages])

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  const SUGGESTION_CHIPS = [
    "Which issue should I fix first?",
    "How long will fixing everything take?",
    "What is my biggest risk right now?",
    "Explain the attack chain to me",
  ]

  async function handleSend(text) {
    const messageText = text || inputValue.trim()
    if (!messageText || isLoading) return

    // Add user message immediately
    const userMessage = {
      id: Date.now(),
      role: "user",
      text: messageText,
      timestamp: new Date().toISOString()
    }
    setMessages(prev => [...prev, userMessage])
    setInputValue("")
    setIsLoading(true)

    // Add typing indicator
    const typingId = Date.now() + 1
    setMessages(prev => [...prev, {
      id: typingId,
      role: "assistant",
      text: "...",
      isTyping: true,
      timestamp: new Date().toISOString()
    }])

    try {
      const data = await sendChatMessage(
        messageText,
        scanContext || {},
        user?.id || "anonymous"
      )

      // API returns { response, timestamp } (see secureiq.js .then(r => r.data))
      const reply =
        (data && typeof data.response === "string" && data.response) ||
        (data?.data && typeof data.data.response === "string" && data.data.response) ||
        "I could not process that. Please try again."

      // Remove typing indicator and add real response
      setMessages(prev => [
        ...prev.filter(m => m.id !== typingId),
        {
          id: Date.now() + 2,
          role: "assistant",
          text: reply,
          timestamp: new Date().toISOString()
        }
      ])
    } catch (error) {
      setMessages(prev => [
        ...prev.filter(m => m.id !== typingId),
        {
          id: Date.now() + 2,
          role: "assistant",
          text: "Connection error. Make sure the backend is running on port 8000.",
          timestamp: new Date().toISOString()
        }
      ])
    } finally {
      setIsLoading(false)
      // Refocus input after response
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const showSuggestions = messages.length <= 1

  return (
    <>
      {/* Floating trigger button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            zIndex: 1000,
            width: "56px",
            height: "56px",
            background: "#DC9F85",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "2px",
          }}
          title="Ask SecureIQ"
          type="button"
        >
          <span style={{
            fontFamily: "'General Sans', sans-serif",
            fontSize: "9px",
            fontWeight: "700",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "#181818",
            lineHeight: 1
          }}>ASK</span>
          <span style={{
            fontFamily: "'Clash Grotesk', sans-serif",
            fontSize: "11px",
            fontWeight: "700",
            color: "#181818",
            lineHeight: 1
          }}>AI</span>
        </button>
      )}

      {/* Chat panel */}
      {isOpen && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            zIndex: 1000,
            width: "380px",
            height: "520px",
            background: "#1E1E1E",
            border: "1px solid #35211A",
            borderRadius: "4px",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div style={{
            padding: "14px 20px",
            borderBottom: "1px solid #35211A",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "#181818",
            flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: "#DC9F85",
              }} />
              <span style={{
                fontFamily: "'General Sans', sans-serif",
                fontSize: "11px",
                fontWeight: "600",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "#B6A596",
              }}>
                SECUREIQ AI
              </span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              type="button"
              style={{
                background: "transparent",
                border: "none",
                color: "#66473B",
                cursor: "pointer",
                fontFamily: "'General Sans', sans-serif",
                fontSize: "11px",
                fontWeight: "600",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                padding: "4px 8px",
              }}
            >
              — CLOSE
            </button>
          </div>

          {/* Messages area */}
          <div style={{
            flex: 1,
            overflowY: "auto",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "0px",
            minHeight: 0,
          }}>
            {messages.map((message, index) => (
              <div key={message.id}>
                {/* Message row */}
                <div style={{
                  padding: "12px 0",
                  borderBottom: index < messages.length - 1
                    ? "1px solid #35211A" : "none",
                }}>
                  {/* Role label */}
                  <div style={{
                    fontFamily: "'General Sans', sans-serif",
                    fontSize: "10px",
                    fontWeight: "600",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: message.role === "user" ? "#DC9F85" : "#66473B",
                    marginBottom: "6px",
                    textAlign: message.role === "user" ? "right" : "left",
                  }}>
                    {message.role === "user" ? "YOU —" : "— SECUREIQ"}
                  </div>

                  {/* Message text */}
                  {message.isTyping ? (
                    <div style={{
                      display: "flex",
                      gap: "4px",
                      alignItems: "center",
                      height: "20px",
                    }}>
                      {[0, 1, 2].map(i => (
                        <div
                          key={i}
                          style={{
                            width: "6px",
                            height: "6px",
                            borderRadius: "50%",
                            background: "#66473B",
                            animation: "typing-dot 1.2s infinite",
                            animationDelay: `${i * 0.2}s`,
                          }}
                        />
                      ))}
                    </div>
                  ) : (
                    <p style={{
                      fontFamily: "'General Sans', sans-serif",
                      fontSize: "14px",
                      fontWeight: "300",
                      color: message.role === "user" ? "#EBDCC4" : "#B6A596",
                      lineHeight: "1.6",
                      textAlign: message.role === "user" ? "right" : "left",
                      margin: 0,
                    }}>
                      {message.text}
                    </p>
                  )}
                </div>
              </div>
            ))}

            {/* Suggestion chips */}
            {showSuggestions && !isLoading && (
              <div style={{
                marginTop: "12px",
                display: "flex",
                flexDirection: "column",
                gap: "6px",
              }}>
                <span style={{
                  fontFamily: "'General Sans', sans-serif",
                  fontSize: "10px",
                  fontWeight: "600",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "#35211A",
                }}>
                  SUGGESTED —
                </span>
                {SUGGESTION_CHIPS.map((chip, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSend(chip)}
                    style={{
                      background: "transparent",
                      border: "1px solid #35211A",
                      borderRadius: "4px",
                      padding: "8px 12px",
                      color: "#B6A596",
                      fontFamily: "'General Sans', sans-serif",
                      fontSize: "12px",
                      fontWeight: "400",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "border-color 150ms, color 150ms",
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = "#DC9F85"
                      e.currentTarget.style.color = "#DC9F85"
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = "#35211A"
                      e.currentTarget.style.color = "#B6A596"
                    }}
                  >
                    — {chip}
                  </button>
                ))}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div style={{
            borderTop: "1px solid #35211A",
            background: "#181818",
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexShrink: 0,
          }}>
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="ASK ANYTHING —"
              disabled={isLoading}
              style={{
                flex: 1,
                minWidth: 0,
                background: "transparent",
                border: "none",
                borderBottom: "1px solid #66473B",
                outline: "none",
                color: "#EBDCC4",
                fontFamily: "'General Sans', sans-serif",
                fontSize: "13px",
                fontWeight: "400",
                padding: "8px 0",
                letterSpacing: "0.02em",
                caretColor: "#DC9F85",
              }}
              onFocus={e => {
                e.target.style.borderBottomColor = "#DC9F85"
              }}
              onBlur={e => {
                e.target.style.borderBottomColor = "#66473B"
              }}
            />
            <button
              type="button"
              onClick={() => handleSend()}
              disabled={isLoading || !inputValue.trim()}
              style={{
                background: isLoading || !inputValue.trim()
                  ? "transparent" : "#DC9F85",
                border: isLoading || !inputValue.trim()
                  ? "1px solid #35211A" : "none",
                borderRadius: "4px",
                padding: "8px 16px",
                color: isLoading || !inputValue.trim()
                  ? "#35211A" : "#181818",
                fontFamily: "'General Sans', sans-serif",
                fontSize: "11px",
                fontWeight: "700",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                cursor: isLoading || !inputValue.trim()
                  ? "not-allowed" : "pointer",
                transition: "all 150ms ease",
                flexShrink: 0,
                whiteSpace: "nowrap",
              }}
            >
              {isLoading ? "..." : "SEND —"}
            </button>
          </div>
        </div>
      )}

      {/* Typing animation keyframes */}
      <style>{`
        @keyframes typing-dot {
          0%, 60%, 100% { opacity: 0.2; transform: scale(1); }
          30% { opacity: 1; transform: scale(1.3); }
        }
      `}</style>
    </>
  )
}
