import { useState, useMemo } from 'react'
import { format, parseISO, differenceInDays, isBefore, startOfToday } from 'date-fns'
import { CalendarCheck, Plus, Trash2, Edit2, Bell, AlertTriangle, Clock, CheckCircle, Mail } from 'lucide-react'
import { useExams } from '../hooks/useExams'
import { useStudents } from '../hooks/useStudents'
import { useAuth } from '../contexts/AuthContext'
import { Modal } from '../components/ui/Modal'
import { Badge, boardColor } from '../components/ui/Badge'
import { PageSkeleton } from '../components/ui/Skeleton'
import { Exam, SUBJECTS, EXAM_TYPES, BOARDS, Board } from '../types'
import { sendSessionEmail } from '../lib/email'
import toast from 'react-hot-toast'

const emptyForm = {
  studentId: '', studentName: '', grade: '', board: 'CBSE' as Board,
  subject: 'Mathematics', examType: 'Unit Test',
  date: '', time: '', syllabus: '', venue: '', notes: '',
}

export default function Exams() {
  const { exams, loading, addExam, updateExam, deleteExam } = useExams()
  const { students } = useStudents()
  const { user } = useAuth()

  const [showForm, setShowForm]       = useState(false)
  const [editing, setEditing]         = useState<Exam | null>(null)
  const [form, setForm]               = useState({ ...emptyForm })
  const [filterStudent, setFilterStudent] = useState('All')
  const [sendingId, setSendingId]     = useState<string | null>(null)

  const today = startOfToday()

  const filtered = useMemo(() => {
    return exams.filter((e) => filterStudent === 'All' || e.studentId === filterStudent)
  }, [exams, filterStudent])

  const upcoming = filtered.filter((e) => !isBefore(parseISO(e.date), today))
  const past     = filtered.filter((e) => isBefore(parseISO(e.date), today))

  const daysLeft = (dateStr: string) => differenceInDays(parseISO(dateStr), today)

  const countdownColor = (days: number) => {
    if (days <= 3)  return 'text-red-600 bg-red-50 border-red-200'
    if (days <= 7)  return 'text-amber-600 bg-amber-50 border-amber-200'
    if (days <= 14) return 'text-blue-600 bg-blue-50 border-blue-200'
    return 'text-emerald-600 bg-emerald-50 border-emerald-200'
  }

  const openAdd = () => {
    setEditing(null)
    setForm({ ...emptyForm })
    setShowForm(true)
  }

  const openEdit = (e: Exam) => {
    setEditing(e)
    setForm({
      studentId: e.studentId, studentName: e.studentName, grade: e.grade, board: e.board,
      subject: e.subject, examType: e.examType,
      date: e.date, time: e.time ?? '', syllabus: e.syllabus ?? '',
      venue: e.venue ?? '', notes: e.notes ?? '',
    })
    setShowForm(true)
  }

  const handleStudentChange = (studentId: string) => {
    const s = students.find((st) => st.id === studentId)
    if (!s) return
    setForm({ ...form, studentId, studentName: s.name, grade: s.grade, board: s.board })
  }

  const handleSave = async () => {
    if (!form.studentId || !form.date || !form.subject || !form.examType) {
      toast.error('Student, date, subject and exam type are required'); return
    }
    try {
      if (editing) {
        await updateExam(editing.id, form)
        toast.success('Exam updated')
      } else {
        await addExam(form)
        toast.success('Exam added')
      }
      setShowForm(false)
    } catch {
      toast.error('Something went wrong')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this exam?')) return
    await deleteExam(id)
    toast.success('Deleted')
  }

  const handleRemind = async (e: Exam) => {
    const student = students.find((s) => s.id === e.studentId)
    if (!student?.email) {
      toast.error(`No parent email for ${e.studentName}`); return
    }
    setSendingId(e.id)
    try {
      const days = daysLeft(e.date)
      const friendlyDate = format(parseISO(e.date), 'EEEE, d MMMM yyyy')
      const timeStr = e.time
        ? (() => {
            const [h, m] = e.time.split(':')
            const hNum = Number(h)
            return `${hNum % 12 || 12}:${m} ${hNum >= 12 ? 'PM' : 'AM'}`
          })()
        : 'Time not specified'

      // Reuse session email as exam reminder with custom notes
      await sendSessionEmail({
        parentEmail:     student.email,
        parentName:      student.parentName,
        studentName:     e.studentName,
        subject:         `${e.subject} — ${e.examType}`,
        date:            friendlyDate,
        startTime:       timeStr,
        durationMinutes: 0,
        teacherName:     user?.displayName ?? 'Your Teacher',
        teacherEmail:    user?.email ?? '',
        notes:           [
          days === 0 ? '⚠️ Exam is TODAY!' : `📅 ${days} day${days !== 1 ? 's' : ''} remaining`,
          e.venue   ? `📍 Venue: ${e.venue}`     : '',
          e.syllabus ? `📚 Syllabus: ${e.syllabus}` : '',
          e.notes   ? `📝 ${e.notes}`             : '',
        ].filter(Boolean).join('\n'),
        action: 'scheduled',
      })
      toast.success(`Reminder sent to ${student.parentName}`)
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to send reminder')
    } finally {
      setSendingId(null)
    }
  }

  if (loading) return <PageSkeleton count={4} />

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Exam Dates</h1>
          <p className="text-slate-500 text-sm mt-0.5">Track upcoming exams per student</p>
        </div>
        <button onClick={openAdd} className="btn-primary">
          <Plus size={16} /> Add Exam
        </button>
      </div>

      {/* Filter */}
      <div className="mb-5">
        <select
          className="input max-w-[220px]"
          value={filterStudent}
          onChange={(e) => setFilterStudent(e.target.value)}
        >
          <option value="All">All Students</option>
          {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {exams.length === 0 ? (
        <div className="card text-center py-16">
          <CalendarCheck size={40} className="text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">No exam dates added yet</p>
          <button onClick={openAdd} className="mt-3 btn-primary btn-sm">
            <Plus size={14} /> Add Exam Date
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Upcoming */}
          {upcoming.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                <Clock size={14} /> Upcoming ({upcoming.length})
              </h2>
              <div className="space-y-3">
                {upcoming.map((e) => {
                  const days = daysLeft(e.date)
                  return (
                    <div key={e.id} className="card p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          {/* Countdown badge */}
                          <div className={`flex-shrink-0 text-center border rounded-xl px-3 py-2 min-w-[64px] ${countdownColor(days)}`}>
                            <div className="text-lg font-bold leading-none">{days}</div>
                            <div className="text-[10px] font-medium mt-0.5">
                              {days === 0 ? 'TODAY' : days === 1 ? 'DAY LEFT' : 'DAYS LEFT'}
                            </div>
                          </div>
                          {/* Details */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-slate-900 text-sm">{e.studentName}</span>
                              <Badge label={e.examType} color={days <= 3 ? 'red' : days <= 7 ? 'amber' : 'blue'} />
                              <Badge label={e.board} color={boardColor(e.board)} />
                            </div>
                            <div className="text-sm text-slate-700 mt-0.5 font-medium">{e.subject}</div>
                            <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-3">
                              <span>📅 {format(parseISO(e.date), 'EEE, d MMM yyyy')}</span>
                              {e.time && <span>⏰ {e.time}</span>}
                              {e.venue && <span>📍 {e.venue}</span>}
                            </div>
                            {e.syllabus && (
                              <p className="text-xs text-slate-400 mt-1">📚 {e.syllabus}</p>
                            )}
                          </div>
                        </div>
                        {/* Actions */}
                        <div className="flex gap-1 flex-shrink-0">
                          <button
                            onClick={() => handleRemind(e)}
                            disabled={sendingId === e.id}
                            title="Send reminder to parent"
                            className="p-1.5 hover:bg-indigo-50 rounded-lg text-slate-400 hover:text-indigo-600 disabled:opacity-50"
                          >
                            {sendingId === e.id
                              ? <span className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin inline-block" />
                              : <Bell size={13} />}
                          </button>
                          <button onClick={() => openEdit(e)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400">
                            <Edit2 size={13} />
                          </button>
                          <button onClick={() => handleDelete(e.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                      {days <= 3 && (
                        <div className="mt-2.5 flex items-center gap-1.5 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-1.5">
                          <AlertTriangle size={12} />
                          {days === 0 ? 'Exam is today! Make sure the student is prepared.' : `Only ${days} day${days > 1 ? 's' : ''} to go — send a reminder to the parent.`}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Past */}
          {past.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                <CheckCircle size={14} /> Past Exams ({past.length})
              </h2>
              <div className="space-y-2">
                {[...past].reverse().map((e) => (
                  <div key={e.id} className="card p-3 opacity-60 hover:opacity-80 transition-opacity">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="text-xs text-slate-400 font-medium min-w-[80px]">
                          {format(parseISO(e.date), 'd MMM yyyy')}
                        </div>
                        <div>
                          <span className="text-sm font-medium text-slate-700">{e.studentName}</span>
                          <span className="text-slate-400 mx-1.5">·</span>
                          <span className="text-sm text-slate-600">{e.subject}</span>
                          <span className="text-slate-400 mx-1.5">·</span>
                          <span className="text-xs text-slate-400">{e.examType}</span>
                        </div>
                      </div>
                      <button onClick={() => handleDelete(e.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-300 hover:text-red-500">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Exam' : 'Add Exam Date'} size="lg">
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

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Subject *</label>
              <select className="input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}>
                {SUBJECTS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Exam Type *</label>
              <select className="input" value={form.examType} onChange={(e) => setForm({ ...form, examType: e.target.value })}>
                {EXAM_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Date *</label>
              <input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <label className="label">Time (optional)</label>
              <input type="time" className="input" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
            </div>
          </div>

          <div>
            <label className="label">Venue / Centre (optional)</label>
            <input className="input" value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} placeholder="e.g. School name, Exam centre" />
          </div>

          <div>
            <label className="label">Syllabus / Topics (optional)</label>
            <textarea className="input resize-none" rows={2} value={form.syllabus} onChange={(e) => setForm({ ...form, syllabus: e.target.value })} placeholder="Chapters or topics covered in this exam…" />
          </div>

          <div>
            <label className="label">Notes (optional)</label>
            <textarea className="input resize-none" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Any special instructions…" />
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={handleSave} className="btn-primary flex-1">
              {editing ? 'Save Changes' : 'Add Exam'}
            </button>
            <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
