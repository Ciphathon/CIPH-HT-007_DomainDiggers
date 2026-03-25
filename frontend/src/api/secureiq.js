import axios from 'axios'

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  timeout: 120000,
})

// ─── Scan ─────────────────────────────────────────────────────────────────────
export const scanDomain = (domain, clerkUserId) =>
  API.post('/api/scan', { domain, clerk_user_id: clerkUserId }).then(r => r.data)

export const getHistory = (domain, clerkUserId) =>
  API.get(`/api/history/${encodeURIComponent(domain)}/${clerkUserId}`).then(r => r.data)

export const getScanById = (scanId) =>
  API.get(`/api/scan/${scanId}`).then(r => r.data)

export const runHackerSimulation = (scanId, businessType, customers) =>
  API.post('/api/simulate', {
    scan_id: scanId,
    business_type: businessType,
    estimated_customers: customers,
  }).then(r => r.data)

export const verifyFix = (scanId, checkName, domain) =>
  API.post('/api/verify-fix', {
    scan_id: scanId,
    check_name: checkName,
    domain,
  }).then(r => r.data)

// ─── DNS Auto-fix ──────────────────────────────────────────────────────────
export const generateAutoFix = (payload) =>
  API.post('/api/autofix/generate-record', payload).then(r => r.data)

export const verifyAutoFix = (payload) =>
  API.post('/api/autofix/verify-applied', payload).then(r => r.data)

// ─── Chat ─────────────────────────────────────────────────────────────────────
export const sendChatMessage = (message, scanContext, clerkUserId) =>
  API.post('/api/chat', {
    message,
    scan_context: scanContext,
    clerk_user_id: clerkUserId,
  }).then(r => r.data)

// ─── Report & Certificate ─────────────────────────────────────────────────────
export const getReportData = (scanId) =>
  API.get(`/api/report/${scanId}`).then(r => r.data)

export const checkCertificateEligibility = (scanId) =>
  API.get(`/api/certificate/${scanId}/eligibility`).then(r => r.data)

export const downloadCertificate = (scanId) =>
  API.get(`/api/certificate/${scanId}`, { responseType: 'blob' }).then(r => r.data)

// ─── Phishing ─────────────────────────────────────────────────────────────────
export const analyzePhishing = (data) =>
  API.post('/api/phishing/analyze', data).then(r => r.data)

export const analyzeConversation = (data) =>
  API.post('/api/phishing/analyze-conversation', data).then(r => r.data)

// ─── Predictive Threat Scoring ───────────────────────────────────────────────
export const predictThreat = (data) =>
  API.post('/api/predict', data).then(r => r.data)

export const getPhishingHistory = (userId) =>
  API.get(`/api/phishing/history/${userId}`).then(r => r.data)

export const getPhishingStats = (userId) =>
  API.get(`/api/phishing/stats/${userId}`).then(r => r.data)

// ─── Onboarding ───────────────────────────────────────────────────────────────
export const initUserProfile = (clerkUserId, email, fullName) =>
  API.post('/api/onboarding/profile/init', {
    clerk_user_id: clerkUserId,
    email,
    full_name: fullName,
  }).then(r => r.data)

export const saveOnboardingData = (data) =>
  API.post('/api/onboarding/profile/save', data).then(r => r.data)

export const completeOnboarding = (clerkUserId) =>
  API.post('/api/onboarding/profile/complete', { clerk_user_id: clerkUserId }).then(r => r.data)

export const getOnboardingStatus = (clerkUserId) =>
  API.get(`/api/onboarding/profile/${clerkUserId}/onboarding-status`).then(r => r.data)

export const getUserProfile = (clerkUserId) =>
  API.get(`/api/onboarding/profile/${clerkUserId}`).then(r => r.data)
