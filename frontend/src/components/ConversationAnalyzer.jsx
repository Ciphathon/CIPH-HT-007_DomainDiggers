import { useState } from 'react'

export default function ConversationAnalyzer({ analysis }) {
  if (!analysis) return null

  const [copied, setCopied] = useState(false)

  const verdict = analysis.verdict || 'UNKNOWN'
  const riskScore = analysis.risk_score ?? 0

  const verdictStyle = v => {
    if (v === 'SAFE') return { bg: 'rgba(182,165,150,0.10)', border: '#B6A596' }
    if (v === 'PHISHING') return { bg: 'rgba(220,159,133,0.10)', border: '#DC9F85' }
    if (v === 'CRITICAL_THREAT') return { bg: 'rgba(220,159,133,0.20)', border: '#DC9F85' }
    return { bg: 'rgba(220,159,133,0.20)', border: '#DC9F85' }
  }

  const graph = analysis.conversation_graph || { nodes: [], edges: [] }
  const conv = analysis.conversation_analysis || {}

  return (
    <div className="space-y-4">
      <div
        className="p-4 border"
        style={{
          background: verdictStyle(verdict).bg,
          borderColor: verdictStyle(verdict).border,
          borderRadius: 4,
        }}
      >
        <p className="label-sm mb-2">CONVERSATION VERDICT</p>
        <p className="display-md">
          {riskScore} <span className="label-sm">/ 100</span>
        </p>
        <p className="display-md">VERDICT: {verdict}</p>
        <p className="label-sm mt-2" style={{ color: '#35211A' }}>
          CONFIDENCE: {analysis.confidence || 'Medium'}
        </p>
      </div>

      <div className="card">
        <p className="label-accent mb-2">GRAPH OVERVIEW</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-xl" style={{ background: 'var(--bg-card-2)', border: '1px solid var(--border)' }}>
            <p className="label-sm" style={{ color: 'var(--text-3)' }}>MESSAGE TURNS</p>
            <p className="display-md">{conv.message_count ?? 0}</p>
          </div>
          <div className="p-3 rounded-xl" style={{ background: 'var(--bg-card-2)', border: '1px solid var(--border)' }}>
            <p className="label-sm" style={{ color: 'var(--text-3)' }}>RISK NODES</p>
            <p className="display-md">{conv.node_count ?? graph.nodes.length}</p>
          </div>
          <div className="p-3 rounded-xl" style={{ background: 'var(--bg-card-2)', border: '1px solid var(--border)' }}>
            <p className="label-sm" style={{ color: 'var(--text-3)' }}>TRANSITIONS</p>
            <p className="display-md">{conv.edge_count ?? graph.edges.length}</p>
          </div>
          <div className="p-3 rounded-xl" style={{ background: 'var(--bg-card-2)', border: '1px solid var(--border)' }}>
            <p className="label-sm" style={{ color: 'var(--text-3)' }}>CHANNEL SHIFT</p>
            <p className="display-md" style={{ color: conv.channel_shift_turns?.length ? '#DC9F85' : '#66473B' }}>
              {conv.channel_shift_turns?.length ? `${conv.channel_shift_turns.length} turns` : 'No'}
            </p>
          </div>
        </div>
      </div>

      <div className="card">
        <p className="label-accent mb-3">RISK NODES</p>
        {graph.nodes.length === 0 ? (
          <p className="body-copy">No nodes produced.</p>
        ) : (
          <div className="space-y-3">
            {graph.nodes.map(n => (
              <div key={n.id} className="p-3 rounded-xl" style={{ background: 'var(--bg-card-2)', border: '1px solid var(--border)' }}>
                <div className="flex justify-between items-center gap-3">
                  <p className="label-sm" style={{ color: '#EBDCC4' }}>
                    TURN {String(n.turn_index).padStart(2, '0')} - {n.sender || 'Unknown'}
                  </p>
                  <p className="label-sm" style={{ color: '#DC9F85' }}>RISK: {n.risk ?? 0}</p>
                </div>
                <p className="body-copy mt-2" style={{ color: '#B6A596', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                  {n.text_excerpt}
                </p>
                {n.labels?.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {n.labels.map(l => (
                      <span
                        key={`${n.id}-${l}`}
                        className="label-sm"
                        style={{ border: '1px solid var(--border)', borderRadius: 2, padding: '4px 8px', color: '#66473B', background: 'rgba(102,71,59,0.10)' }}
                      >
                        {l}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <p className="label-accent mb-3">TRANSITION EDGES</p>
        {graph.edges.length === 0 ? (
          <p className="body-copy">No transition edges detected.</p>
        ) : (
          <div className="space-y-2">
            {graph.edges.map((e, idx) => (
              <div key={idx} className="p-3 rounded-xl" style={{ background: 'var(--bg-card-2)', border: '1px solid var(--border)' }}>
                <p className="label-sm" style={{ color: '#EBDCC4' }}>
                  {e.from} {'->'} {e.to} - {e.type}
                </p>
                {e.labels?.length > 0 && (
                  <p className="label-sm mt-1" style={{ color: '#B6A596' }}>
                    Labels: {e.labels.join(', ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {analysis.red_flags_summary && (
        <div className="card">
          <p className="label-accent mb-2">RED FLAGS</p>
          <p className="body-copy" style={{ color: '#B6A596' }}>{analysis.red_flags_summary}</p>
        </div>
      )}

      {analysis.recommended_action && (
        <button
          className={analysis.recommended_action === 'REPORT' ? 'btn-danger w-full' : 'btn-primary w-full'}
          onClick={async () => {
            if (!analysis.safe_response_template) return
            await navigator.clipboard.writeText(analysis.safe_response_template)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          }}
        >
          {copied
            ? 'COPIED!'
            : analysis.recommended_action === 'REPORT'
              ? 'REPORT THIS THREAT -'
              : 'SAFE RESPONSE -'}
        </button>
      )}

      {analysis.safe_response_template && (
        <div className="card">
          <p className="label-accent mb-2">SAFE RESPONSE TEMPLATE</p>
          <code
            style={{
              display: 'block',
              marginTop: 10,
              padding: 12,
              background: '#0D0D0D',
              border: '1px solid #35211A',
              color: '#B6A596',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            }}
          >
            {analysis.safe_response_template}
          </code>
        </div>
      )}
    </div>
  )
}

