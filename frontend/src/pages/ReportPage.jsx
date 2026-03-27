import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Download, Printer } from 'lucide-react'
import { downloadCertificate, getReportData } from '../api/secureiq.js'

export default function ReportPage() {
  const { scanId } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [downloadingCert, setDownloadingCert] = useState(false)

  useEffect(() => {
    getReportData(scanId).then(d => { setData(d); setLoading(false) }).catch(() => setLoading(false))
  }, [scanId])

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}><p style={{ color: 'var(--text-2)' }}>Loading report…</p></div>
  if (!data) return <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}><p style={{ color: 'var(--red)' }}>Report not found</p></div>

  const handleCertificateDownload = async () => {
    setDownloadingCert(true)
    try {
      const blob = await downloadCertificate(scanId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `secureiq-cert-${data.domain}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (_) {
      alert('Certificate download failed. Ensure the score is 70+.')
    } finally {
      setDownloadingCert(false)
    }
  }

  const criticals = data.findings?.filter(f => f.status === 'critical') || []
  const warnings = data.findings?.filter(f => f.status === 'warning') || []
  const passed = data.findings?.filter(f => f.status === 'pass') || []

  return (
    <div className="min-h-screen" style={{ background: '#EBDCC4', color: '#181818' }}>
      <div className="print:hidden border-b p-4 flex items-center gap-4" style={{ borderColor: '#B6A596' }}>
        <Link to="/dashboard" className="flex items-center gap-2 label-sm" style={{ color: '#181818' }}>
          <ArrowLeft size={14} /> BACK TO DASHBOARD
        </Link>
        <button onClick={() => window.print()} className="ml-auto btn-ghost" style={{ color: '#181818', borderColor: '#66473B' }}>
          <Printer size={14} /> PRINT / SAVE PDF
        </button>
        {data.score >= 70 && (
          <button onClick={handleCertificateDownload} disabled={downloadingCert} className="btn-ghost" style={{ color: '#181818', borderColor: '#66473B' }}>
            <Download size={14} /> {downloadingCert ? 'GENERATING CERTIFICATE…' : 'DOWNLOAD CERTIFICATE'}
          </button>
        )}
      </div>

      <div className="max-w-5xl mx-auto px-10 py-10">
        <h1 className="display-lg">SECUREIQ SECURITY REPORT</h1>
        <p className="label-sm mt-2">GENERATED {new Date(data.created_at).toLocaleDateString('en-IN')}</p>

        <div className="my-8 border-y py-6 grid grid-cols-1 md:grid-cols-2" style={{ borderColor: '#B6A596' }}>
          <div>
            <p className="label-sm" style={{ color: '#66473B' }}>DOMAIN</p>
            <p className="display-md" style={{ color: '#66473B' }}>{data.domain}</p>
          </div>
          <div className="text-left md:text-right">
            <p className="label-sm" style={{ color: '#66473B' }}>SECURITY SCORE</p>
            <p className="display-lg">{data.score}</p>
          </div>
        </div>

        <div className="mb-8">
          <div className="grid grid-cols-3 border-b pb-2" style={{ borderColor: '#B6A596' }}>
            <p className="label-sm">FINDING</p>
            <p className="label-sm">STATUS</p>
            <p className="label-sm">DETAIL</p>
          </div>
          {(data.findings || []).map((f, i) => (
            <div key={`${f.check}-${i}`} className="grid grid-cols-3 py-3 border-b" style={{ borderColor: '#B6A596' }}>
              <p className="label-sm">{f.check}</p>
              <p className="label-sm">{String(f.status).toUpperCase()}</p>
              <p className="body-copy" style={{ color: '#181818' }}>{f.explanation || f.detail}</p>
            </div>
          ))}
        </div>

        <div className="mb-8">
          <p className="label-sm mb-3">FIX ROADMAP</p>
          {[...criticals, ...warnings].slice(0, 6).map((f, i) => (
            <div key={`${f.check}-${i}`} className="py-2 border-b" style={{ borderColor: '#B6A596' }}>
              <p className="label-sm">{String(i + 1).padStart(2, '0')} - {f.check}</p>
              <p className="body-copy" style={{ color: '#181818' }}>{f.fix_steps || 'Apply recommended remediation and re-run verification scan.'}</p>
            </div>
          ))}
        </div>

        {data.damage?.total_financial_risk > 0 && (
          <div className="border p-5" style={{ borderColor: '#B6A596', borderRadius: 4 }}>
            <p className="label-sm" style={{ color: '#66473B' }}>PROJECTED EXPOSURE</p>
            <p className="display-md" style={{ color: '#66473B' }}>{data.damage.formatted_total}</p>
          </div>
        )}

        <div className="mt-10 pt-4 border-t" style={{ borderColor: '#B6A596' }}>
          <p className="label-sm">SECUREIQ - TEAM DOMAINDIGGERS - CIPHATHON 26</p>
          <p className="label-sm mt-1" style={{ color: '#66473B' }}>This report was generated using AI-assisted analysis.</p>
        </div>
      </div>
    </div>
  )
}
