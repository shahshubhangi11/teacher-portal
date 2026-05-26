import { useState, useMemo } from 'react'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  getDay, isSameMonth, isToday, addMonths, subMonths, parseISO,
} from 'date-fns'
import { ChevronLeft, ChevronRight, Plus, Clock, CheckCircle, XCircle, Edit2, Trash2, Mail } from 'lucide-react'
import { useSessions } from '../hooks/useSessions'
import { useStudents } from '../hooks/useStudents'
import { useAuth } from '../contexts/AuthContext'
import { Modal } from '../components/ui/Modal'
import { sendSessionEmail, SessionAction } from '../lib/email'
import { Session, SUBJECTS } from '../types'
import toast from 'react-hot-toast'

const DURATION_PRESETS = [
  { label: '30 min',  value: 30  },
  { label: '45 min',  value: 45  },
  { label: '1 hr',    value: 60  },
  { label: '1.5 hr',  value: 90  },
  { label: '2 hr',    value: 120 },
]

const emptyForm = {
  studentId: '', studentName: '', subject: 'English',
  date: format(new Date(), 'yyyy-MM-dd'),
  startTime: '09:00', endTime: '10:00',
  durationMinutes: 60, status: 'scheduled' as Session['status'],
  notes: '', amount: 0, billed: false,
}

export default function Schedule() {
  const { user } = useAuth()
  const { sessions, addSession, updateSession, deleteSession } = useSessions()
  const { students } = useStudents()
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Session | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [notifyParent, setNotifyParent] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [cancelConfirm, setCancelConfirm] = useState<Session | null>(null)
  const [notifyOnCancel, setNotifyOnCancel] = useState(true)

  const days = useMemo(() => {
    const start = startOfMonth(currentMonth)
    const end = endOfMonth(currentMonth)
    return eachDayOfInterval({ start, end })
  }, [currentMonth])

  const sessionMap = useMemo(() => {
    const map: Record<string, Session[]> = {}
    sessions.forEach((s) => {
      if (!map[s.date]) map[s.date] = []
      map[s.date].push(s)
    })
    return map
  }, [sessions])

  const selectedSessions = useMemo(
    () => (sessionMap[selectedDate] ?? []).sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [sessionMap, selectedDate]
  )

  const calcDuration = (start: string, end: string) => {
    const [sh, sm] = start.split(':').map(Number)
    const [eh, em] = end.split(':').map(Number)
    return Math.max(0, (eh * 60 + em) - (sh * 60 + sm))
  }

  const calcAmount = (studentId: string, durationMin: number) => {
    const s = students.find((s) => s.id === studentId)
    if (!s || s.billingType !== 'hourly') return 0
    return Math.round(((s.hourlyRate ?? 0) * durationMin) / 60)
  }

  const handleStudentChange = (studentId: string) => {
    const s = students.find((st) => st.id === studentId)
    const dur = calcDuration(form.startTime, form.endTime)
    setForm({
      ...form,
      studentId,
      studentName: s?.name ?? '',
      subject: s?.subjects?.[0] ?? 'English',
      amount: calcAmount(studentId, dur),
    })
  }

  const handleTimeChange = (field: 'startTime' | 'endTime', val: string) => {
    const updated = { ...form, [field]: val }
    const dur = calcDuration(updated.startTime, updated.endTime)
    setForm({ ...updated, durationMinutes: dur, amount: calcAmount(updated.studentId, dur) })
  }

  // Apply a duration preset: keep startTime, push endTime forward
  const applyDurationPreset = (minutes: number) => {
    const [sh, sm] = form.startTime.split(':').map(Number)
    const totalMin = sh * 60 + sm + minutes
    const eh = Math.floor(totalMin / 60) % 24
    const em = totalMin % 60
    const endTime = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`
    setForm({ ...form, endTime, durationMinutes: minutes, amount: calcAmount(form.studentId, minutes) })
  }

  const openAdd = (date?: string) => {
    setEditing(null)
    setForm({ ...emptyForm, date: date ?? selectedDate })
    setNotifyParent(false)
    setShowForm(true)
  }

  const openEdit = (s: Session) => {
    setEditing(s)
    setForm({
      studentId: s.studentId, studentName: s.studentName, subject: s.subject,
      date: s.date, startTime: s.startTime, endTime: s.endTime,
      durationMinutes: s.durationMinutes, status: s.status,
      notes: s.notes ?? '', amount: s.amount, billed: s.billed,
    })
    setNotifyParent(false)
    setShowForm(true)
  }

  const buildEmailParams = (s: typeof form, action: SessionAction) => {
    const student = students.find((st) => st.id === s.studentId)
    const [h, m] = s.startTime.split(':')
    const hNum = Number(h)
    const ampm = hNum >= 12 ? 'PM' : 'AM'
    const h12 = hNum % 12 || 12
    return {
      parentEmail:     student?.email ?? '',
      parentName:      student?.parentName ?? '',
      studentName:     student?.name ?? s.studentName,
      subject:         s.subject,
      date:            format(parseISO(s.date), 'EEEE, d MMMM yyyy'),
      startTime:       `${h12}:${m} ${ampm}`,
      durationMinutes: s.durationMinutes,
      teacherName:     user?.displayName ?? 'Your Teacher',
      teacherEmail:    user?.email ?? '',
      notes:           s.notes,
      action,
    }
  }

  const trySendEmail = async (params: ReturnType<typeof buildEmailParams>) => {
    const student = students.find((s) => s.id === form.studentId)
    if (!student?.email) {
      toast('⚠️ No parent email on file — email not sent', { icon: '⚠️' }); return
    }
    if (!import.meta.env.VITE_MAILER_URL) {
      toast('Mailer not configured — add VITE_MAILER_URL to .env', { icon: '⚠️' }); return
    }
    setSendingEmail(true)
    try {
      await sendSessionEmail(params)
      toast.success(`📧 Email sent to ${params.parentName}`)
    } catch (e: any) {
      toast.error('Email failed: ' + (e.message ?? 'unknown error'))
    } finally {
      setSendingEmail(false)
    }
  }

  const handleSave = async () => {
    if (!form.studentId || !form.date || !form.startTime || !form.endTime) {
      toast.error('Please fill all required fields'); return
    }
    if (form.durationMinutes <= 0) {
      toast.error('End time must be after start time'); return
    }
    try {
      if (editing) {
        await updateSession(editing.id, form)
        toast.success('Session updated')
        if (notifyParent) await trySendEmail(buildEmailParams(form, 'rescheduled'))
      } else {
        await addSession(form)
        toast.success('Session added')
        if (notifyParent) await trySendEmail(buildEmailParams(form, 'scheduled'))
      }
      setShowForm(false)
    } catch {
      toast.error('Something went wrong')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this session?')) return
    await deleteSession(id)
    toast.success('Session deleted')
  }

  const handleStatus = async (session: Session, status: Session['status']) => {
    await updateSession(session.id, { status })
    toast.success(`Marked as ${status}`)
    if (status === 'cancelled') {
      setCancelConfirm(session)   // opens notify dialog
    }
  }

  const handleCancelEmailDismiss = () => setCancelConfirm(null)

  const handleCancelEmailSend = async () => {
    if (!cancelConfirm) return
    const params = buildEmailParams(
      {
        studentId: cancelConfirm.studentId,
        studentName: cancelConfirm.studentName,
        subject: cancelConfirm.subject,
        date: cancelConfirm.date,
        startTime: cancelConfirm.startTime,
        endTime: cancelConfirm.endTime,
        durationMinutes: cancelConfirm.durationMinutes,
        status: 'cancelled',
        notes: cancelConfirm.notes ?? '',
        amount: cancelConfirm.amount,
        billed: cancelConfirm.billed,
      },
      'cancelled',
    )
    setCancelConfirm(null)
    await trySendEmail(params)
  }

  const startOffset = getDay(days[0]) === 0 ? 6 : getDay(days[0]) - 1 // Mon-start

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Schedule</h1>
          <p className="text-slate-500 text-sm mt-0.5">Manage your teaching sessions</p>
        </div>
        <button onClick={() => openAdd()} className="btn-primary">
          <Plus size={16} /> Add Session
        </button>
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] gap-6">
        {/* Calendar */}
        <div className="card p-4 sm:p-5">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setCurrentMonth((m) => subMonths(m, 1))} className="p-2 hover:bg-slate-100 rounded-lg">
              <ChevronLeft size={18} />
            </button>
            <h2 className="font-semibold text-slate-900">{format(currentMonth, 'MMMM yyyy')}</h2>
            <button onClick={() => setCurrentMonth((m) => addMonths(m, 1))} className="p-2 hover:bg-slate-100 rounded-lg">
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-2">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d} className="text-center text-xs font-medium text-slate-400 py-1">{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: startOffset }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {days.map((day) => {
              const ds = format(day, 'yyyy-MM-dd')
              const daySessions = sessionMap[ds] ?? []
              const isSelected = ds === selectedDate
              const _isToday = isToday(day)
              return (
                <button
                  key={ds}
                  onClick={() => setSelectedDate(ds)}
                  className={`relative aspect-square flex flex-col items-center justify-start pt-1.5 rounded-lg
                             text-sm transition-all ${
                    isSelected
                      ? 'bg-indigo-600 text-white'
                      : _isToday
                      ? 'bg-indigo-50 text-indigo-700 font-semibold'
                      : 'hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  <span className="text-xs font-medium">{format(day, 'd')}</span>
                  {daySessions.length > 0 && (
                    <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center">
                      {daySessions.slice(0, 3).map((_, i) => (
                        <div
                          key={i}
                          className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-indigo-500'}`}
                        />
                      ))}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Sessions for selected date */}
        <div className="card p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900 text-sm">
              {format(parseISO(selectedDate), 'EEE, MMM d')}
            </h3>
            <button onClick={() => openAdd(selectedDate)} className="btn-primary btn-sm">
              <Plus size={14} /> Add
            </button>
          </div>

          {selectedSessions.length === 0 ? (
            <div className="text-center py-10">
              <Clock size={32} className="text-slate-200 mx-auto mb-2" />
              <p className="text-slate-400 text-sm">No sessions on this day</p>
            </div>
          ) : (
            <div className="space-y-3">
              {selectedSessions.map((s) => (
                <div key={s.id} className="border border-slate-100 rounded-xl p-3 hover:border-slate-200 transition-colors">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium text-slate-900 text-sm">{s.studentName}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{s.subject}</div>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(s)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400">
                        <Edit2 size={13} />
                      </button>
                      <button onClick={() => handleDelete(s.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Clock size={12} /> {s.startTime} – {s.endTime}
                    </span>
                    <span>{s.durationMinutes} min</span>
                    {s.amount > 0 && <span className="text-emerald-600 font-medium">₹{s.amount}</span>}
                  </div>
                  {s.notes && <p className="text-xs text-slate-400 mt-1.5 italic">{s.notes}</p>}
                  <div className="flex gap-2 mt-2.5">
                    <StatusChip status={s.status} />
                    {s.status === 'scheduled' && (
                      <>
                        <button onClick={() => handleStatus(s, 'completed')} className="text-xs text-green-600 hover:text-green-700 font-medium flex items-center gap-1">
                          <CheckCircle size={12} /> Done
                        </button>
                        <button onClick={() => handleStatus(s, 'cancelled')} className="text-xs text-red-500 hover:text-red-600 font-medium flex items-center gap-1">
                          <XCircle size={12} /> Cancel
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Session' : 'New Session'}>
        <div className="space-y-4">
          <div>
            <label className="label">Student *</label>
            <select className="input" value={form.studentId} onChange={(e) => handleStudentChange(e.target.value)}>
              <option value="">Select student…</option>
              {students.filter((s) => s.active).map((s) => (
                <option key={s.id} value={s.id}>{s.name} — Grade {s.grade}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Subject</label>
              <select className="input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}>
                {SUBJECTS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Date *</label>
              <input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Start Time *</label>
              <input type="time" className="input" value={form.startTime} onChange={(e) => handleTimeChange('startTime', e.target.value)} />
            </div>
            <div>
              <label className="label">End Time *</label>
              <input type="time" className="input" value={form.endTime} onChange={(e) => handleTimeChange('endTime', e.target.value)} />
            </div>
          </div>

          {/* Duration presets */}
          <div>
            <label className="label">Duration Presets</label>
            <div className="flex gap-2 flex-wrap">
              {DURATION_PRESETS.map(({ label, value }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => applyDurationPreset(value)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                    form.durationMinutes === value
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600'
                  }`}
                >
                  {label}
                </button>
              ))}
              <span className="text-xs text-slate-400 self-center ml-1">
                {form.durationMinutes > 0 ? `→ ${form.durationMinutes} min` : ''}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Duration (auto)</label>
              <div className="input bg-slate-50 text-slate-500">{form.durationMinutes} minutes</div>
            </div>
            <div>
              <label className="label">Amount (₹)</label>
              <input type="number" className="input" min={0} value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
            </div>
          </div>

          {editing && (
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Session['status'] })}>
                <option value="scheduled">Scheduled</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          )}

          <div>
            <label className="label">Notes (optional)</label>
            <textarea className="input resize-none" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="What was covered..." />
          </div>

          {/* Notify parent toggle */}
          <label className="flex items-center gap-3 p-3 bg-indigo-50 border border-indigo-100 rounded-xl cursor-pointer hover:bg-indigo-100 transition-colors">
            <input
              type="checkbox"
              checked={notifyParent}
              onChange={(e) => setNotifyParent(e.target.checked)}
              className="w-4 h-4 rounded accent-indigo-600"
            />
            <div>
              <div className="text-sm font-medium text-indigo-800 flex items-center gap-2">
                <Mail size={14} />
                {editing ? 'Notify parent of schedule change' : 'Send class notification email to parent'}
              </div>
              <div className="text-xs text-indigo-500 mt-0.5">
                {editing
                  ? 'Parent will receive a "Class Rescheduled" email'
                  : 'Parent will receive a "Class Scheduled" email'}
              </div>
            </div>
          </label>

          <div className="flex gap-3 pt-2">
            <button onClick={handleSave} disabled={sendingEmail} className="btn-primary flex-1">
              {sendingEmail
                ? 'Sending email…'
                : editing
                ? notifyParent ? 'Save & Notify Parent' : 'Save Changes'
                : notifyParent ? 'Add & Notify Parent' : 'Add Session'}
            </button>
            <button onClick={() => setShowForm(false)} disabled={sendingEmail} className="btn-secondary">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* Cancel notification dialog */}
      <Modal open={!!cancelConfirm} onClose={handleCancelEmailDismiss} title="Session Cancelled">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            <strong>{cancelConfirm?.studentName}</strong>'s {cancelConfirm?.subject} class on{' '}
            {cancelConfirm ? format(parseISO(cancelConfirm.date), 'EEE, d MMM') : ''} has been cancelled.
          </p>
          <p className="text-sm text-slate-700 font-medium">Notify the parent by email?</p>
          <div className="flex gap-3">
            <button onClick={handleCancelEmailSend} disabled={sendingEmail} className="btn-primary flex-1">
              <Mail size={15} /> {sendingEmail ? 'Sending…' : 'Yes, Email Parent'}
            </button>
            <button onClick={handleCancelEmailDismiss} className="btn-secondary">No Thanks</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    scheduled: 'bg-blue-50 text-blue-600',
    completed: 'bg-green-50 text-green-700',
    cancelled: 'bg-red-50 text-red-600',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${map[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  )
}
