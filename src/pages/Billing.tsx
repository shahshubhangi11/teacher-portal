import { useState, useMemo } from 'react'
import { format } from 'date-fns'
import {
  CreditCard, Plus, CheckCircle, Trash2, Download, Mail,
  TrendingUp, Clock, IndianRupee,
} from 'lucide-react'
import { useBilling } from '../hooks/useBilling'
import { useSessions } from '../hooks/useSessions'
import { useStudents } from '../hooks/useStudents'
import { useAuth } from '../contexts/AuthContext'
import { Modal } from '../components/ui/Modal'
import { Badge } from '../components/ui/Badge'
import { PageSkeleton } from '../components/ui/Skeleton'
import { BillingRecord, BillingType } from '../types'
import { sendBillingEmail } from '../lib/email'
import toast from 'react-hot-toast'
import jsPDF from 'jspdf'

export default function Billing() {
  const { records, loading, addRecord, deleteRecord, markPaid, totalEarned, totalPending } = useBilling()
  const { sessions, updateSession } = useSessions()
  const { students } = useStudents()
  const { user } = useAuth()
  const [showForm, setShowForm] = useState(false)
  const [filterStudent, setFilterStudent] = useState('All')
  const [filterStatus, setFilterStatus] = useState('All')
  const [emailingId, setEmailingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    studentId: '', billingType: 'hourly' as BillingType,
    month: format(new Date(), 'yyyy-MM'), amount: 0,
    selectedSessions: [] as string[],
  })

  const unbilledSessions = useMemo(() => {
    return sessions.filter((s) => !s.billed && s.status === 'completed')
  }, [sessions])

  const studentUnbilled = useMemo(() => {
    if (!form.studentId) return []
    return unbilledSessions.filter((s) => s.studentId === form.studentId)
  }, [unbilledSessions, form.studentId])

  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (filterStudent !== 'All' && r.studentId !== filterStudent) return false
      if (filterStatus === 'Paid' && !r.paid) return false
      if (filterStatus === 'Pending' && r.paid) return false
      return true
    })
  }, [records, filterStudent, filterStatus])

  const handleStudentChange = (studentId: string) => {
    const st = students.find((s) => s.id === studentId)
    const sessions = unbilledSessions.filter((s) => s.studentId === studentId)
    const totalAmount = sessions.reduce((sum, s) => sum + s.amount, 0)
    setForm({
      ...form,
      studentId,
      billingType: st?.billingType ?? 'hourly',
      amount: st?.billingType === 'monthly' ? (st.monthlyFee ?? 0) : totalAmount,
      selectedSessions: st?.billingType === 'hourly' ? sessions.map((s) => s.id) : [],
    })
  }

  const handleSessionToggle = (id: string) => {
    const sel = form.selectedSessions.includes(id)
      ? form.selectedSessions.filter((s) => s !== id)
      : [...form.selectedSessions, id]
    const total = sel.reduce((sum, sid) => {
      const s = sessions.find((s) => s.id === sid)
      return sum + (s?.amount ?? 0)
    }, 0)
    setForm({ ...form, selectedSessions: sel, amount: total })
  }

  const handleCreate = async () => {
    if (!form.studentId || form.amount <= 0) {
      toast.error('Select a student and amount must be > 0')
      return
    }
    const st = students.find((s) => s.id === form.studentId)!
    try {
      const selSessions = sessions.filter((s) => form.selectedSessions.includes(s.id))
      await addRecord({
        studentId: form.studentId,
        studentName: st.name,
        billingType: form.billingType,
        month: form.month,
        sessionIds: form.selectedSessions,
        totalSessions: selSessions.length,
        totalHours: Math.round(selSessions.reduce((s, r) => s + r.durationMinutes, 0) / 60 * 10) / 10,
        amount: form.amount,
        paid: false,
      })
      // Mark sessions as billed
      for (const sid of form.selectedSessions) {
        await updateSession(sid, { billed: true })
      }
      toast.success('Invoice created')
      setShowForm(false)
    } catch {
      toast.error('Something went wrong')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this invoice?')) return
    await deleteRecord(id)
    toast.success('Invoice deleted')
  }

  const handleEmailInvoice = async (r: BillingRecord) => {
    const student = students.find((s) => s.id === r.studentId)
    if (!student?.email) {
      toast.error(`No email on file for ${r.studentName}. Add it in the Students page.`)
      return
    }
    setEmailingId(r.id)
    try {
      await sendBillingEmail({
        parentEmail:    student.email,
        parentName:     student.parentName,
        studentName:    r.studentName,
        invoiceNumber:  r.invoiceNumber,
        period:         r.month ?? 'N/A',
        totalSessions:  r.totalSessions ?? 0,
        totalHours:     r.totalHours ?? 0,
        amount:         r.amount,
        teacherName:    user?.displayName ?? 'Your Teacher',
        teacherEmail:   user?.email ?? '',
        upiId:          import.meta.env.VITE_UPI_ID as string | undefined,
      })
      toast.success(`Invoice emailed to ${student.parentName}`)
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to send email')
    } finally {
      setEmailingId(null)
    }
  }

  const exportPDF = (record: BillingRecord) => {
    const doc = new jsPDF()
    const pageW = doc.internal.pageSize.width

    doc.setFontSize(22)
    doc.setTextColor(79, 70, 229)
    doc.text('TeachDesk', 20, 25)

    doc.setFontSize(11)
    doc.setTextColor(100)
    doc.text('Private Teaching Invoice', 20, 33)

    doc.setDrawColor(200)
    doc.line(20, 38, pageW - 20, 38)

    doc.setFontSize(10)
    doc.setTextColor(0)
    doc.text(`Invoice No: ${record.invoiceNumber}`, 20, 48)
    doc.text(`Date: ${format(new Date(), 'dd MMM yyyy')}`, pageW - 60, 48)

    doc.setFontSize(11)
    doc.text('Billed To:', 20, 62)
    doc.setFontSize(10)
    doc.text(record.studentName, 20, 70)

    doc.line(20, 78, pageW - 20, 78)

    doc.setFontSize(10)
    doc.setFont(undefined as any, 'bold')
    doc.text('Description', 20, 87)
    doc.text('Amount', pageW - 40, 87)
    doc.setFont(undefined as any, 'normal')

    let y = 97
    if (record.billingType === 'hourly') {
      doc.text(`Tutoring sessions (${record.totalSessions} classes, ${record.totalHours} hrs)`, 20, y)
      if (record.month) doc.text(`Period: ${record.month}`, 20, y + 7)
      y += 14
    } else {
      doc.text(`Monthly tutoring fee — ${record.month}`, 20, y)
      y += 10
    }

    doc.line(20, y + 4, pageW - 20, y + 4)
    y += 13
    doc.setFont(undefined as any, 'bold')
    doc.text('Total', 20, y)
    doc.setTextColor(79, 70, 229)
    doc.text(`INR ${record.amount.toLocaleString()}`, pageW - 40, y)
    doc.setFont(undefined as any, 'normal')
    doc.setTextColor(0)

    if (record.paid) {
      y += 12
      doc.setTextColor(22, 163, 74)
      doc.text(`PAID on ${record.paidDate ?? ''}`, 20, y)
    }

    doc.setFontSize(9)
    doc.setTextColor(150)
    doc.text('Thank you for your trust and support!', 20, 270)

    doc.save(`${record.invoiceNumber}.pdf`)
  }

  if (loading) return <PageSkeleton count={3} />

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Billing</h1>
          <p className="text-slate-500 text-sm mt-0.5">Track earnings and invoices</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          <Plus size={16} /> New Invoice
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <SummaryCard icon={<TrendingUp size={20} className="text-green-600" />} label="Total Earned" value={`₹${totalEarned.toLocaleString()}`} bg="bg-green-50" />
        <SummaryCard icon={<Clock size={20} className="text-amber-600" />} label="Pending" value={`₹${totalPending.toLocaleString()}`} bg="bg-amber-50" />
        <SummaryCard icon={<IndianRupee size={20} className="text-indigo-600" />} label="Invoices" value={String(records.length)} bg="bg-indigo-50" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select className="input max-w-[180px]" value={filterStudent} onChange={(e) => setFilterStudent(e.target.value)}>
          <option value="All">All Students</option>
          {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <div className="flex gap-1.5">
          {['All', 'Pending', 'Paid'].map((f) => (
            <button key={f} onClick={() => setFilterStatus(f)} className={`tab-btn ${filterStatus === f ? 'active' : ''}`}>{f}</button>
          ))}
        </div>
      </div>

      {/* Invoice list */}
      {filtered.length === 0 ? (
        <div className="card text-center py-16">
          <CreditCard size={40} className="text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">No invoices found</p>
          <button onClick={() => setShowForm(true)} className="mt-3 btn-primary btn-sm"><Plus size={14} /> Create Invoice</button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <div key={r.id} className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-slate-900 text-sm">{r.studentName}</span>
                  <Badge
                    label={r.paid ? 'Paid' : 'Pending'}
                    color={r.paid ? 'green' : 'amber'}
                  />
                  <Badge label={r.billingType === 'hourly' ? 'Hourly' : 'Monthly'} color="slate" />
                </div>
                <div className="text-xs text-slate-500">
                  {r.invoiceNumber}
                  {r.month && ` · ${r.month}`}
                  {r.totalSessions != null && ` · ${r.totalSessions} sessions`}
                  {r.totalHours != null && `, ${r.totalHours} hrs`}
                </div>
                {r.paidDate && <div className="text-xs text-green-600 mt-0.5">Paid on {r.paidDate}</div>}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-lg font-bold text-slate-900">₹{r.amount.toLocaleString()}</span>
                <div className="flex gap-1.5">
                  {!r.paid && (
                    <button
                      onClick={() => markPaid(r.id).then(() => toast.success('Marked as paid'))}
                      className="btn-sm btn bg-green-50 text-green-700 hover:bg-green-100"
                    >
                      <CheckCircle size={14} /> Mark Paid
                    </button>
                  )}
                  <button onClick={() => exportPDF(r)} className="btn-secondary btn-sm">
                    <Download size={14} /> PDF
                  </button>
                  <button
                    onClick={() => handleEmailInvoice(r)}
                    disabled={emailingId === r.id}
                    className="btn-secondary btn-sm disabled:opacity-50"
                    title="Email invoice to parent"
                  >
                    {emailingId === r.id
                      ? <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />
                      : <Mail size={14} />}
                    {emailingId === r.id ? 'Sending…' : 'Email'}
                  </button>
                  <button onClick={() => handleDelete(r.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Invoice Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="Create Invoice" size="lg">
        <div className="space-y-4">
          <div>
            <label className="label">Student *</label>
            <select className="input" value={form.studentId} onChange={(e) => handleStudentChange(e.target.value)}>
              <option value="">Select student…</option>
              {students.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.billingType})</option>)}
            </select>
          </div>

          {form.studentId && (
            <>
              <div>
                <label className="label">Month / Period</label>
                <input type="month" className="input" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} />
              </div>

              {form.billingType === 'hourly' && studentUnbilled.length > 0 && (
                <div>
                  <label className="label">Select Sessions to Bill ({form.selectedSessions.length} selected)</label>
                  <div className="space-y-2 max-h-48 overflow-y-auto border border-slate-200 rounded-lg p-2">
                    {studentUnbilled.map((s) => (
                      <label key={s.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.selectedSessions.includes(s.id)}
                          onChange={() => handleSessionToggle(s.id)}
                          className="accent-indigo-600"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-slate-700">{s.date} · {s.subject}</span>
                          <span className="text-xs text-slate-400 ml-2">{s.durationMinutes} min</span>
                        </div>
                        <span className="text-sm font-medium text-emerald-600">₹{s.amount}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="label">Total Amount (₹) *</label>
                <input
                  type="number"
                  className="input"
                  min={0}
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
                />
              </div>
            </>
          )}

          <div className="flex gap-3 pt-2">
            <button onClick={handleCreate} className="btn-primary flex-1">Create Invoice</button>
            <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function SummaryCard({ icon, label, value, bg }: { icon: React.ReactNode; label: string; value: string; bg: string }) {
  return (
    <div className="card p-4">
      <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center mb-3`}>{icon}</div>
      <div className="text-xl font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
    </div>
  )
}

