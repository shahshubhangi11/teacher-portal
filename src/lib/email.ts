/**
 * Email sending via Google Apps Script.
 * The script runs inside the teacher's Google account and uses
 * MailApp.sendEmail() — so every email arrives FROM the teacher's Gmail.
 *
 * Setup: see the Google Apps Script snippet in SETUP.md.
 */

const MAILER_URL = import.meta.env.VITE_MAILER_URL    as string
const SECRET     = import.meta.env.VITE_MAILER_SECRET  as string | undefined
const UPI_ID     = import.meta.env.VITE_UPI_ID         as string | undefined

function checkConfig() {
  if (!MAILER_URL) throw new Error(
    'VITE_MAILER_URL is not set in your .env file. Deploy the mailer backend first.'
  )
}

async function send(to: string, subject: string, html: string, fromName?: string) {
  checkConfig()
  const res = await fetch(`${MAILER_URL}/send`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: SECRET, to, subject, html, fromName }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any).error || `Mailer error ${res.status}`)
  }
}

// ── Session notification ─────────────────────────────────────────────────────
export type SessionAction = 'scheduled' | 'rescheduled' | 'cancelled'

export interface SessionEmailParams {
  parentEmail: string
  parentName: string
  studentName: string
  subject: string
  date: string
  startTime: string
  durationMinutes: number
  teacherName: string
  teacherEmail: string
  notes?: string
  action?: SessionAction
}

export async function sendSessionEmail(p: SessionEmailParams) {
  const action = p.action ?? 'scheduled'

  const meta: Record<SessionAction, { emoji: string; title: string; color: string; intro: string }> = {
    scheduled:   { emoji: '📚', title: 'Class Scheduled',    color: '#4f46e5', intro: 'A class has been scheduled' },
    rescheduled: { emoji: '🔄', title: 'Class Rescheduled',  color: '#d97706', intro: 'A class has been rescheduled' },
    cancelled:   { emoji: '❌', title: 'Class Cancelled',    color: '#dc2626', intro: 'A class has been cancelled' },
  }
  const { emoji, title, color, intro } = meta[action]

  const detailRows = action !== 'cancelled' ? `
    <tr><td style="padding:10px 12px;color:#64748b">📚 Subject</td><td style="padding:10px 12px;font-weight:600">${p.subject}</td></tr>
    <tr style="background:#f1f5f9"><td style="padding:10px 12px;color:#64748b">📅 Date</td><td style="padding:10px 12px;font-weight:600">${p.date}</td></tr>
    <tr><td style="padding:10px 12px;color:#64748b">⏰ Time</td><td style="padding:10px 12px;font-weight:600">${p.startTime}&nbsp;(${p.durationMinutes} min)</td></tr>
    <tr style="background:#f1f5f9"><td style="padding:10px 12px;color:#64748b">📝 Notes</td><td style="padding:10px 12px">${p.notes || 'None'}</td></tr>
  ` : `
    <tr><td style="padding:10px 12px;color:#64748b">📚 Subject</td><td style="padding:10px 12px;font-weight:600">${p.subject}</td></tr>
    <tr style="background:#f1f5f9"><td style="padding:10px 12px;color:#64748b">📅 Was scheduled for</td><td style="padding:10px 12px;font-weight:600">${p.date} at ${p.startTime}</td></tr>
    ${p.notes ? `<tr><td style="padding:10px 12px;color:#64748b">📝 Reason</td><td style="padding:10px 12px">${p.notes}</td></tr>` : ''}
  `

  const html = `
<div style="font-family:sans-serif;max-width:520px;margin:auto">
  <div style="background:${color};color:white;padding:20px 24px;border-radius:10px 10px 0 0">
    <h2 style="margin:0">${title} ${emoji}</h2>
  </div>
  <div style="background:#f8fafc;padding:24px;border-radius:0 0 10px 10px;border:1px solid #e2e8f0">
    <p>Dear <strong>${p.parentName}</strong>,</p>
    <p>${intro} for <strong>${p.studentName}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;background:white;border:1px solid #e2e8f0;border-radius:8px">
      ${detailRows}
    </table>
    <p style="color:#64748b;font-size:13px">For queries: <a href="mailto:${p.teacherEmail}">${p.teacherEmail}</a></p>
    <p style="margin-top:16px">Regards,<br><strong>${p.teacherName}</strong></p>
  </div>
</div>`

  const subjects: Record<SessionAction, string> = {
    scheduled:   `Class Scheduled – ${p.studentName} on ${p.date}`,
    rescheduled: `Class Rescheduled – ${p.studentName} on ${p.date}`,
    cancelled:   `Class Cancelled – ${p.studentName} on ${p.date}`,
  }

  await send(p.parentEmail, subjects[action], html, p.teacherName)
}

// ── Progress report ──────────────────────────────────────────────────────────
export interface ReportEmailParams {
  parentEmail: string
  parentName: string
  studentName: string
  grade: string
  period: string
  attendancePercent: number
  totalSessions: number
  subjectGrades: string   // newline-separated "Subject: Grade (remarks)"
  strengths: string
  areasToImprove: string
  teacherRemarks: string
  quizSummary?: string
  teacherName: string
  teacherEmail: string
}

export async function sendReportEmail(p: ReportEmailParams) {
  const rows = p.subjectGrades.split('\n').map(line =>
    `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${line}</td></tr>`
  ).join('')

  const section = (icon: string, title: string, text: string) =>
    text ? `<h3 style="color:#1e293b;margin:18px 0 6px">${icon} ${title}</h3><p style="color:#374151;margin:0">${text}</p>` : ''

  const html = `
<div style="font-family:sans-serif;max-width:560px;margin:auto">
  <div style="background:#4f46e5;color:white;padding:20px 24px;border-radius:10px 10px 0 0">
    <h2 style="margin:0">Progress Report 📊</h2>
    <p style="margin:4px 0 0;opacity:.8">${p.studentName} &middot; ${p.period}</p>
  </div>
  <div style="background:#f8fafc;padding:24px;border-radius:0 0 10px 10px;border:1px solid #e2e8f0">
    <p>Dear <strong>${p.parentName}</strong>,</p>
    <table style="width:100%;border-collapse:collapse;margin:12px 0">
      <tr>
        <td style="padding:4px 8px 4px 0;width:33%">
          <div style="background:white;border:1px solid #e2e8f0;border-radius:8px;padding:12px;text-align:center">
            <div style="font-size:22px;font-weight:700;color:#4f46e5">${p.attendancePercent}%</div>
            <div style="color:#64748b;font-size:12px">Attendance</div>
          </div>
        </td>
        <td style="padding:4px 8px;width:33%">
          <div style="background:white;border:1px solid #e2e8f0;border-radius:8px;padding:12px;text-align:center">
            <div style="font-size:22px;font-weight:700;color:#4f46e5">${p.totalSessions}</div>
            <div style="color:#64748b;font-size:12px">Sessions</div>
          </div>
        </td>
        <td style="padding:4px 0 4px 8px;width:33%">
          <div style="background:white;border:1px solid #e2e8f0;border-radius:8px;padding:12px;text-align:center">
            <div style="font-size:18px;font-weight:700;color:#4f46e5">Grade ${p.grade}</div>
            <div style="color:#64748b;font-size:12px">Standard</div>
          </div>
        </td>
      </tr>
    </table>
    <h3 style="color:#1e293b;margin:18px 0 8px">📚 Subject Performance</h3>
    <table style="width:100%;border-collapse:collapse;background:white;border:1px solid #e2e8f0;border-radius:8px">${rows}</table>
    ${section('💪', 'Strengths',        p.strengths)}
    ${section('📈', 'Areas to Improve', p.areasToImprove)}
    ${section('👩‍🏫', "Teacher's Remarks", p.teacherRemarks)}
    ${p.quizSummary ? section('📝', 'Quiz Summary', p.quizSummary) : ''}
    <p style="margin-top:20px;color:#64748b;font-size:13px">Contact: <a href="mailto:${p.teacherEmail}">${p.teacherEmail}</a></p>
    <p>Regards,<br><strong>${p.teacherName}</strong></p>
  </div>
</div>`
  await send(
    p.parentEmail,
    `Progress Report – ${p.studentName} (${p.period})`,
    html,
    p.teacherName,
  )
}

// ── Billing reminder ─────────────────────────────────────────────────────────
export interface BillingEmailParams {
  parentEmail: string
  parentName: string
  studentName: string
  invoiceNumber: string
  period: string
  totalSessions: number
  totalHours: number
  amount: number
  dueDate?: string
  teacherName: string
  teacherEmail: string
  upiId?: string
}

export async function sendBillingEmail(p: BillingEmailParams) {
  const upi = p.upiId || UPI_ID || ''

  // UPI deep-link: scanning this QR opens any UPI app pre-filled with amount
  const upiLink = upi
    ? `upi://pay?pa=${encodeURIComponent(upi)}&pn=${encodeURIComponent(p.teacherName)}&am=${p.amount}&cu=INR&tn=${encodeURIComponent(`Tuition ${p.period}`)}`
    : ''

  // QR code image generated on-the-fly by qrserver.com (free, no auth needed)
  const qrUrl = upiLink
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=10&data=${encodeURIComponent(upiLink)}`
    : ''

  const paymentSection = upi ? `
    <div style="background:#fefce8;border:1px solid #fde68a;border-radius:12px;padding:20px;margin:20px 0;text-align:center">
      <p style="margin:0 0 4px;font-weight:700;color:#92400e;font-size:15px">💳 Pay via UPI</p>
      <p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#1e293b;letter-spacing:.5px">${upi}</p>
      ${qrUrl ? `
      <img src="${qrUrl}" alt="UPI QR Code" width="180" height="180"
           style="display:block;margin:0 auto 12px;border-radius:8px;border:1px solid #fde68a" />
      <p style="margin:0;font-size:12px;color:#92400e">Scan with any UPI app (GPay, PhonePe, Paytm…)</p>
      ` : ''}
    </div>` : `
    <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:14px;margin:16px 0">
      <p style="margin:0;color:#92400e">Contact teacher for payment details: <a href="mailto:${p.teacherEmail}">${p.teacherEmail}</a></p>
    </div>`

  const html = `
<div style="font-family:sans-serif;max-width:520px;margin:auto">
  <div style="background:#4f46e5;color:white;padding:20px 24px;border-radius:10px 10px 0 0">
    <h2 style="margin:0">Monthly Fee Statement 🧾</h2>
    <p style="margin:4px 0 0;opacity:.8">${p.period} &middot; ${p.invoiceNumber}</p>
  </div>
  <div style="background:#f8fafc;padding:24px;border-radius:0 0 10px 10px;border:1px solid #e2e8f0">
    <p>Dear <strong>${p.parentName}</strong>,</p>
    <p>Please find the monthly fee statement for <strong>${p.studentName}</strong>'s tutoring sessions.</p>

    <table style="width:100%;border-collapse:collapse;margin:16px 0;background:white;border:1px solid #e2e8f0;border-radius:8px">
      <tr><td style="padding:10px 12px;color:#64748b">Month / Period</td><td style="padding:10px 12px;font-weight:600">${p.period}</td></tr>
      <tr style="background:#f1f5f9"><td style="padding:10px 12px;color:#64748b">Total Sessions</td><td style="padding:10px 12px;font-weight:600">${p.totalSessions} classes &middot; ${p.totalHours} hrs</td></tr>
      <tr><td style="padding:10px 12px;color:#64748b">Due By</td><td style="padding:10px 12px;font-weight:600">${p.dueDate || '7 days from receipt'}</td></tr>
      <tr style="background:#4f46e5;color:white">
        <td style="padding:14px 12px;font-weight:700;font-size:15px">Total Amount Due</td>
        <td style="padding:14px 12px;font-size:22px;font-weight:700">&#8377;${p.amount.toLocaleString()}</td>
      </tr>
    </table>

    ${paymentSection}

    <p style="color:#64748b;font-size:13px;margin-top:16px">
      For queries contact ${p.teacherName}: <a href="mailto:${p.teacherEmail}">${p.teacherEmail}</a>
    </p>
    <p style="margin-top:12px">Thank you!<br><strong>${p.teacherName}</strong></p>
  </div>
</div>`

  await send(
    p.parentEmail,
    `Monthly Fee – ${p.studentName} (${p.period}) ₹${p.amount.toLocaleString()}`,
    html,
    p.teacherName,
  )
}
