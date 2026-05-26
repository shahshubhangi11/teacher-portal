import { useState } from 'react'
import { format } from 'date-fns'
import { Plus, BarChart2, Printer, Trash2, Eye, Mail } from 'lucide-react'
import { useReports } from '../hooks/useReports'
import { useStudents } from '../hooks/useStudents'
import { useSessions } from '../hooks/useSessions'
import { useAuth } from '../contexts/AuthContext'
import { Modal } from '../components/ui/Modal'
import { Badge, boardColor } from '../components/ui/Badge'
import { PageSkeleton } from '../components/ui/Skeleton'
import { Report, SubjectReport, SUBJECTS, BOARDS, Board } from '../types'
import { sendReportEmail } from '../lib/email'
import toast from 'react-hot-toast'
import jsPDF from 'jspdf'

const GRADE_OPTIONS = ['A+', 'A', 'B+', 'B', 'C', 'D', 'Not Assessed']

const emptyForm = {
  studentId: '', studentName: '', studentGrade: '', board: 'CBSE' as Board,
  period: `${format(new Date(), 'MMM yyyy')}`,
  subjects: [] as SubjectReport[],
  totalSessions: 0, attendancePercent: 100,
  strengths: '', areasToImprove: '', teacherRemarks: '',
}

export default function Reports() {
  const { reports, loading, addReport, deleteReport } = useReports()
  const { students } = useStudents()
  const { sessions } = useSessions()
  const { user } = useAuth()
  const [showForm, setShowForm] = useState(false)
  const [viewing, setViewing] = useState<Report | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [emailingId, setEmailingId] = useState<string | null>(null)

  const handleStudentChange = (studentId: string) => {
    const s = students.find((st) => st.id === studentId)
    if (!s) return
    const studentSessions = sessions.filter((sess) => sess.studentId === studentId && sess.status === 'completed')
    const subjectRows: SubjectReport[] = (s.subjects ?? []).map((sub) => ({
      subject: sub, grade: 'Not Assessed', remarks: '',
    }))
    setForm({
      ...form,
      studentId,
      studentName: s.name,
      studentGrade: s.grade,
      board: s.board,
      subjects: subjectRows,
      totalSessions: studentSessions.length,
    })
  }

  const updateSubject = (idx: number, field: keyof SubjectReport, val: string) => {
    setForm((f) => {
      const subs = [...f.subjects]
      subs[idx] = { ...subs[idx], [field]: val }
      return { ...f, subjects: subs }
    })
  }

  const addSubjectRow = () => {
    setForm((f) => ({
      ...f,
      subjects: [...f.subjects, { subject: 'English', grade: 'Not Assessed', remarks: '' }],
    }))
  }

  const removeSubjectRow = (idx: number) => {
    setForm((f) => ({ ...f, subjects: f.subjects.filter((_, i) => i !== idx) }))
  }

  const handleSave = async () => {
    if (!form.studentId || !form.period || form.subjects.length === 0) {
      toast.error('Select a student, period, and add at least one subject')
      return
    }
    try {
      await addReport(form)
      toast.success('Report created')
      setShowForm(false)
    } catch {
      toast.error('Something went wrong')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this report?')) return
    await deleteReport(id)
    toast.success('Deleted')
  }

  const handleEmailReport = async (r: Report) => {
    const student = students.find((s) => s.id === r.studentId)
    if (!student?.email) {
      toast.error(`No email on file for ${r.studentName}. Add it in the Students page.`)
      return
    }
    setEmailingId(r.id)
    try {
      const subjectGrades = r.subjects
        .map((s) => `${s.subject}: ${s.grade}${s.remarks ? ` (${s.remarks})` : ''}`)
        .join('\n')
      await sendReportEmail({
        parentEmail:       student.email,
        parentName:        student.parentName,
        studentName:       r.studentName,
        grade:             r.studentGrade,
        period:            r.period,
        attendancePercent: r.attendancePercent,
        totalSessions:     r.totalSessions,
        subjectGrades,
        strengths:         r.strengths,
        areasToImprove:    r.areasToImprove,
        teacherRemarks:    r.teacherRemarks,
        teacherName:       user?.displayName ?? 'Your Teacher',
        teacherEmail:      user?.email ?? '',
      })
      toast.success(`Report emailed to ${student.parentName}`)
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to send email')
    } finally {
      setEmailingId(null)
    }
  }

  const printReport = (r: Report) => {
    const doc = new jsPDF()
    const pageW = doc.internal.pageSize.width
    let y = 20

    // Header
    doc.setFontSize(20)
    doc.setTextColor(79, 70, 229)
    doc.text('Student Progress Report', 20, y); y += 10
    doc.setFontSize(10)
    doc.setTextColor(100)
    doc.text('TeachDesk — Private Teaching Portal', 20, y); y += 8
    doc.setDrawColor(200)
    doc.line(20, y, pageW - 20, y); y += 10

    // Student Info
    doc.setFontSize(11)
    doc.setTextColor(0)
    doc.setFont(undefined as any, 'bold')
    doc.text('Student Information', 20, y); y += 7
    doc.setFont(undefined as any, 'normal')
    doc.setFontSize(10)
    doc.text(`Name: ${r.studentName}`, 20, y)
    doc.text(`Board: ${r.board}`, 100, y); y += 6
    doc.text(`Grade: ${r.studentGrade}`, 20, y)
    doc.text(`Period: ${r.period}`, 100, y); y += 6
    doc.text(`Total Sessions: ${r.totalSessions}`, 20, y)
    doc.text(`Attendance: ${r.attendancePercent}%`, 100, y); y += 10

    // Subjects table
    doc.line(20, y, pageW - 20, y); y += 6
    doc.setFont(undefined as any, 'bold')
    doc.text('Subject', 20, y)
    doc.text('Grade', 100, y)
    doc.text('Remarks', 130, y); y += 6
    doc.setFont(undefined as any, 'normal')
    doc.line(20, y, pageW - 20, y); y += 4

    r.subjects.forEach((s) => {
      doc.text(s.subject, 20, y)
      doc.text(s.grade, 100, y)
      const remarks = doc.splitTextToSize(s.remarks, 60) as string[]
      doc.text(remarks, 130, y)
      y += Math.max(6, remarks.length * 5)
    })

    y += 6
    doc.line(20, y, pageW - 20, y); y += 8

    // Remarks
    if (r.strengths) {
      doc.setFont(undefined as any, 'bold')
      doc.text('Strengths:', 20, y); y += 6
      doc.setFont(undefined as any, 'normal')
      const lines = doc.splitTextToSize(r.strengths, pageW - 40) as string[]
      doc.text(lines, 20, y); y += lines.length * 5 + 4
    }
    if (r.areasToImprove) {
      doc.setFont(undefined as any, 'bold')
      doc.text('Areas to Improve:', 20, y); y += 6
      doc.setFont(undefined as any, 'normal')
      const lines = doc.splitTextToSize(r.areasToImprove, pageW - 40) as string[]
      doc.text(lines, 20, y); y += lines.length * 5 + 4
    }
    if (r.teacherRemarks) {
      doc.setFont(undefined as any, 'bold')
      doc.text("Teacher's Remarks:", 20, y); y += 6
      doc.setFont(undefined as any, 'normal')
      const lines = doc.splitTextToSize(r.teacherRemarks, pageW - 40) as string[]
      doc.text(lines, 20, y); y += lines.length * 5 + 4
    }

    y += 10
    doc.text('Teacher Signature: _______________________', 20, y)
    doc.text(`Date: ${format(new Date(), 'dd/MM/yyyy')}`, pageW - 60, y)

    doc.save(`Report_${r.studentName}_${r.period}.pdf`)
  }

  if (loading) return <PageSkeleton count={4} />

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Reports</h1>
          <p className="text-slate-500 text-sm mt-0.5">Student progress reports</p>
        </div>
        <button onClick={() => { setForm({ ...emptyForm }); setShowForm(true) }} className="btn-primary">
          <Plus size={16} /> New Report
        </button>
      </div>

      {reports.length === 0 ? (
        <div className="card text-center py-16">
          <BarChart2 size={40} className="text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">No reports yet</p>
          <button onClick={() => setShowForm(true)} className="mt-3 btn-primary btn-sm">
            <Plus size={14} /> Create Report
          </button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {reports.map((r) => (
            <div key={r.id} className="card p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-sm">
                    {r.studentName[0]}
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900 text-sm">{r.studentName}</div>
                    <div className="text-xs text-slate-500">Grade {r.studentGrade} · {r.period}</div>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setViewing(r)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400" title="View">
                    <Eye size={13} />
                  </button>
                  <button onClick={() => printReport(r)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400" title="Export PDF">
                    <Printer size={13} />
                  </button>
                  <button
                    onClick={() => handleEmailReport(r)}
                    disabled={emailingId === r.id}
                    className="p-1.5 hover:bg-indigo-50 rounded-lg text-slate-400 hover:text-indigo-600 disabled:opacity-50"
                    title="Email parent"
                  >
                    {emailingId === r.id
                      ? <span className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin inline-block" />
                      : <Mail size={13} />}
                  </button>
                  <button onClick={() => handleDelete(r.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500" title="Delete">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                <Badge label={r.board} color={boardColor(r.board)} />
                <Badge label={`${r.attendancePercent}% attendance`} color={r.attendancePercent >= 80 ? 'green' : 'amber'} />
                <Badge label={`${r.totalSessions} sessions`} color="blue" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {r.subjects.map((s) => (
                  <div key={s.subject} className="text-center bg-slate-50 rounded-lg p-2">
                    <div className={`text-sm font-bold ${gradeColor(s.grade)}`}>{s.grade}</div>
                    <div className="text-xs text-slate-500 truncate">{s.subject}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* View Modal */}
      <Modal open={!!viewing} onClose={() => setViewing(null)} title={`${viewing?.studentName} — ${viewing?.period}`} size="lg">
        {viewing && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-slate-400">Grade:</span> <span className="font-medium">{viewing.studentGrade}</span></div>
              <div><span className="text-slate-400">Board:</span> <span className="font-medium">{viewing.board}</span></div>
              <div><span className="text-slate-400">Sessions:</span> <span className="font-medium">{viewing.totalSessions}</span></div>
              <div><span className="text-slate-400">Attendance:</span> <span className="font-medium">{viewing.attendancePercent}%</span></div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 text-slate-500 font-medium">Subject</th>
                  <th className="text-center py-2 text-slate-500 font-medium">Grade</th>
                  <th className="text-left py-2 text-slate-500 font-medium">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {viewing.subjects.map((s, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="py-2 font-medium">{s.subject}</td>
                    <td className="py-2 text-center font-bold"><span className={gradeColor(s.grade)}>{s.grade}</span></td>
                    <td className="py-2 text-slate-500 text-xs">{s.remarks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {viewing.strengths && <div><div className="text-xs font-semibold text-slate-400 uppercase mb-1">Strengths</div><p className="text-sm">{viewing.strengths}</p></div>}
            {viewing.areasToImprove && <div><div className="text-xs font-semibold text-slate-400 uppercase mb-1">Areas to Improve</div><p className="text-sm">{viewing.areasToImprove}</p></div>}
            {viewing.teacherRemarks && <div><div className="text-xs font-semibold text-slate-400 uppercase mb-1">Teacher Remarks</div><p className="text-sm">{viewing.teacherRemarks}</p></div>}
            <div className="flex gap-2">
              <button onClick={() => printReport(viewing)} className="btn-primary flex-1"><Printer size={15} /> Export PDF</button>
              <button
                onClick={() => handleEmailReport(viewing)}
                disabled={emailingId === viewing.id}
                className="btn-secondary flex-1"
              >
                {emailingId === viewing.id
                  ? <><span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" /> Sending…</>
                  : <><Mail size={15} /> Email Parent</>}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Create Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="New Progress Report" size="xl">
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Student *</label>
              <select className="input" value={form.studentId} onChange={(e) => handleStudentChange(e.target.value)}>
                <option value="">Select student…</option>
                {students.map((s) => <option key={s.id} value={s.id}>{s.name} — Grade {s.grade}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Period *</label>
              <input className="input" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} placeholder="e.g., Jan 2025 – Mar 2025" />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Total Sessions</label>
              <input type="number" className="input" min={0} value={form.totalSessions} onChange={(e) => setForm({ ...form, totalSessions: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Attendance (%)</label>
              <input type="number" className="input" min={0} max={100} value={form.attendancePercent} onChange={(e) => setForm({ ...form, attendancePercent: Number(e.target.value) })} />
            </div>
          </div>

          {/* Subject grades */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Subject Grades *</label>
              <button type="button" onClick={addSubjectRow} className="btn-secondary btn-sm">
                <Plus size={12} /> Add Subject
              </button>
            </div>
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {form.subjects.map((s, i) => (
                <div key={i} className="grid grid-cols-[1fr_80px_1fr_auto] gap-2 items-center">
                  <select className="input" value={s.subject} onChange={(e) => updateSubject(i, 'subject', e.target.value)}>
                    {SUBJECTS.map((sub) => <option key={sub}>{sub}</option>)}
                  </select>
                  <select className="input" value={s.grade} onChange={(e) => updateSubject(i, 'grade', e.target.value)}>
                    {GRADE_OPTIONS.map((g) => <option key={g}>{g}</option>)}
                  </select>
                  <input className="input" value={s.remarks} onChange={(e) => updateSubject(i, 'remarks', e.target.value)} placeholder="Remarks..." />
                  <button onClick={() => removeSubjectRow(i)} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Strengths</label>
            <textarea className="input resize-none" rows={2} value={form.strengths} onChange={(e) => setForm({ ...form, strengths: e.target.value })} placeholder="What the student excels at..." />
          </div>
          <div>
            <label className="label">Areas to Improve</label>
            <textarea className="input resize-none" rows={2} value={form.areasToImprove} onChange={(e) => setForm({ ...form, areasToImprove: e.target.value })} placeholder="Topics or skills to focus on..." />
          </div>
          <div>
            <label className="label">Teacher's Overall Remarks</label>
            <textarea className="input resize-none" rows={3} value={form.teacherRemarks} onChange={(e) => setForm({ ...form, teacherRemarks: e.target.value })} placeholder="Overall assessment and guidance for parents..." />
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={handleSave} className="btn-primary flex-1">Create Report</button>
            <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function gradeColor(grade: string) {
  if (grade === 'A+' || grade === 'A') return 'text-green-600'
  if (grade === 'B+' || grade === 'B') return 'text-blue-600'
  if (grade === 'C') return 'text-amber-600'
  if (grade === 'D') return 'text-red-500'
  return 'text-slate-400'
}

