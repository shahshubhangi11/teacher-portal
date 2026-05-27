import { useState, useMemo } from 'react'
import {
  Plus, BookOpen, Edit2, Trash2, Eye, Printer,
  FileText, Brain, PenTool, Type, Search,
  Download, File, Link,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useContent } from '../hooks/useContent'
import { useStudents } from '../hooks/useStudents'
import { PageSkeleton } from '../components/ui/Skeleton'
import { Modal } from '../components/ui/Modal'
import { Badge, boardColor } from '../components/ui/Badge'
import type { Content, ContentType, Board, Question } from '../types'
import { BOARDS, GRADES, STANDARD_GRADES, SUBJECTS } from '../types'
import toast from 'react-hot-toast'
import jsPDF from 'jspdf'

type MainTab = 'worksheet' | 'study-material' | 'quiz' | 'test' | 'writing-skills' | 'ld-material' | 'student-pdfs'
type WorksheetSub = 'grammar-worksheet' | 'maths-practice' | 'worksheet'

const MAIN_TABS: { id: MainTab; label: string; icon: React.ReactNode }[] = [
  { id: 'worksheet',      label: 'Worksheets',    icon: <FileText size={15} /> },
  { id: 'study-material', label: 'Study Material',icon: <BookOpen size={15} /> },
  { id: 'quiz',           label: 'Quizzes',       icon: <PenTool size={15} /> },
  { id: 'test',           label: 'Tests',         icon: <Type size={15} /> },
  { id: 'writing-skills', label: 'Writing Skills',icon: <PenTool size={15} /> },
  { id: 'ld-material',    label: 'LD Materials',  icon: <Brain size={15} /> },
  { id: 'student-pdfs',   label: 'Student PDFs',  icon: <Link size={15} /> },
]

const WORKSHEET_SUBS: { id: WorksheetSub; label: string }[] = [
  { id: 'grammar-worksheet', label: 'Grammar' },
  { id: 'maths-practice',    label: 'Maths Practice' },
  { id: 'worksheet',         label: 'General' },
]

const emptyForm: Omit<Content, 'id' | 'createdAt'> = {
  title: '', type: 'grammar-worksheet', board: 'All', grade: 'All',
  subject: 'English', description: '', body: '',
  questions: [], totalMarks: 0, duration: 30,
  tags: [], forLD: false,
  fileUrl: '', fileName: '', fileSize: 0,
  studentId: '', studentName: '',
}

const emptyQ: Question = { id: '', text: '', type: 'mcq', options: ['', '', '', ''], answer: '', marks: 1 }

export default function Content() {
  const { user } = useAuth()
  const { items, loading, addContent, updateContent, deleteContent } = useContent()
  const { students } = useStudents()
  const [mainTab, setMainTab] = useState<MainTab>('worksheet')
  const [worksheetSub, setWorksheetSub] = useState<WorksheetSub>('grammar-worksheet')
  const [showForm, setShowForm] = useState(false)
  const [viewing, setViewing] = useState<Content | null>(null)
  const [editing, setEditing] = useState<Content | null>(null)
  const [form, setForm] = useState<Omit<Content, 'id' | 'createdAt'>>({ ...emptyForm })
  const [boardFilter, setBoardFilter] = useState<string>('All')
  const [gradeFilter, setGradeFilter] = useState<string>('All')
  const [studentFilter, setStudentFilter] = useState<string>('All')
  const [search, setSearch] = useState('')
  const [gradeOther, setGradeOther] = useState('')

  const activeTypes = useMemo((): ContentType[] => {
    if (mainTab === 'student-pdfs') return ['grammar-worksheet','maths-practice','worksheet','study-material','quiz','test','writing-skills','ld-material']
    if (mainTab === 'worksheet') return [worksheetSub]
    return [mainTab]
  }, [mainTab, worksheetSub])

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (mainTab === 'student-pdfs') {
        if (!item.fileUrl) return false
        if (studentFilter !== 'All' && item.studentId !== studentFilter) return false
        if (search && !item.title.toLowerCase().includes(search.toLowerCase())) return false
        return true
      }
      if (!activeTypes.includes(item.type)) return false
      if (boardFilter !== 'All' && item.board !== 'All' && item.board !== boardFilter) return false
      if (gradeFilter !== 'All' && item.grade !== 'All' && item.grade !== gradeFilter) return false
      if (search && !item.title.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [items, activeTypes, boardFilter, gradeFilter, studentFilter, search, mainTab])

  const openAdd = () => {
    setEditing(null)
    const defaultType: ContentType = mainTab === 'worksheet' ? worksheetSub : mainTab === 'student-pdfs' ? 'study-material' : mainTab
    setForm({ ...emptyForm, type: defaultType })
    setGradeOther('')
    setShowForm(true)
  }

  const openEdit = (item: Content) => {
    setEditing(item)
    const isCustomGrade = item.grade !== 'All' && !STANDARD_GRADES.includes(item.grade)
    setGradeOther(isCustomGrade ? item.grade : '')
    setForm({
      title: item.title, type: item.type, board: item.board,
      grade: isCustomGrade ? 'Others' : item.grade,
      subject: item.subject, description: item.description ?? '', body: item.body ?? '',
      questions: item.questions ?? [], totalMarks: item.totalMarks ?? 0,
      duration: item.duration ?? 30, tags: item.tags ?? [], forLD: item.forLD ?? false,
      fileUrl: item.fileUrl ?? '', fileName: item.fileName ?? '',
      fileSize: item.fileSize ?? 0,
      studentId: item.studentId ?? '', studentName: item.studentName ?? '',
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('Title is required'); return }
    if (form.grade === 'Others' && !gradeOther.trim()) {
      toast.error('Please specify the grade / standard')
      return
    }
    // Basic URL validation if a Drive link is provided
    if (form.fileUrl && !form.fileUrl.startsWith('http')) {
      toast.error('Please enter a valid URL starting with https://'); return
    }
    try {
      const payload = {
        ...form,
        grade: form.grade === 'Others' ? gradeOther.trim() : form.grade,
      }
      if (editing) {
        await updateContent(editing.id, payload)
        toast.success('Updated')
      } else {
        await addContent(payload)
        toast.success('Created')
      }
      setShowForm(false)
    } catch (e) {
      toast.error('Something went wrong')
      console.error(e)
    }
  }

  const handleDelete = async (item: Content) => {
    if (!confirm(`Delete "${item.title}"?`)) return
    await deleteContent(item.id)
    toast.success('Deleted')
  }

  const addQuestion = () => {
    setForm((f) => ({
      ...f,
      questions: [...(f.questions ?? []), { ...emptyQ, id: Date.now().toString() }],
    }))
  }

  const removeQuestion = (idx: number) => {
    setForm((f) => ({ ...f, questions: (f.questions ?? []).filter((_, i) => i !== idx) }))
  }

  const updateQuestion = (idx: number, data: Partial<Question>) => {
    setForm((f) => {
      const qs = [...(f.questions ?? [])]
      qs[idx] = { ...qs[idx], ...data }
      return { ...f, questions: qs }
    })
  }

  const updateOption = (qIdx: number, oIdx: number, val: string) => {
    setForm((f) => {
      const qs = [...(f.questions ?? [])]
      const opts = [...(qs[qIdx].options ?? [])]
      opts[oIdx] = val
      qs[qIdx] = { ...qs[qIdx], options: opts }
      return { ...f, questions: qs }
    })
  }

  const handleStudentChange = (studentId: string) => {
    const s = students.find((s) => s.id === studentId)
    setForm((f) => ({ ...f, studentId, studentName: s?.name ?? '' }))
  }

  const printContent = (item: Content) => {
    const doc = new jsPDF()
    const pageW = doc.internal.pageSize.width
    let y = 20
    doc.setFontSize(16); doc.setTextColor(79, 70, 229)
    doc.text(item.title, 20, y); y += 10
    doc.setFontSize(9); doc.setTextColor(100)
    doc.text([item.board, `Grade ${item.grade}`, item.subject].filter(Boolean).join(' · '), 20, y); y += 8
    doc.setDrawColor(200); doc.line(20, y, pageW - 20, y); y += 8
    doc.setFontSize(10); doc.setTextColor(0)
    if (item.body) {
      const lines = doc.splitTextToSize(item.body, pageW - 40) as string[]
      doc.text(lines, 20, y); y += lines.length * 5 + 5
    }
    if (item.questions?.length) {
      item.questions.forEach((q, i) => {
        if (y > 260) { doc.addPage(); y = 20 }
        doc.setFont(undefined as any, 'bold')
        const qText = `Q${i + 1}. ${q.text} (${q.marks} mark${q.marks > 1 ? 's' : ''})`
        const qLines = doc.splitTextToSize(qText, pageW - 40) as string[]
        doc.text(qLines, 20, y); y += qLines.length * 5 + 3
        doc.setFont(undefined as any, 'normal')
        if (q.type === 'mcq' && q.options) {
          q.options.forEach((o, oi) => { if (o) { doc.text(`  ${String.fromCharCode(65 + oi)}. ${o}`, 20, y); y += 5 } })
        }
        if (q.type === 'short') { doc.text('  Ans: ___________________________________', 20, y); y += 8 }
        if (q.type === 'long') { for (let l = 0; l < 3; l++) { doc.text('  ____________________________________________', 20, y); y += 6 } }
        if (q.type === 'fill') { doc.text('  Ans: ____________________', 20, y); y += 8 }
        y += 2
      })
    }
    doc.save(`${item.title}.pdf`)
  }

  if (loading) return <PageSkeleton />

  const isQnA = form.type === 'quiz' || form.type === 'test'
  const isPDFTab = mainTab === 'student-pdfs'

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Content Library</h1>
          <p className="text-slate-500 text-sm mt-0.5">{items.length} total items · {items.filter(i => i.fileUrl).length} PDFs uploaded</p>
        </div>
        <button onClick={openAdd} className="btn-primary">
          <Plus size={16} /> {isPDFTab ? 'Add PDF Link' : 'Create'}
        </button>
      </div>

      {/* Main Tabs */}
      <div className="flex gap-1.5 flex-wrap mb-4 pb-4 border-b border-slate-200">
        {MAIN_TABS.map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => setMainTab(id)}
            className={`flex items-center gap-1.5 tab-btn ${mainTab === id ? 'active' : ''} ${id === 'student-pdfs' ? 'ml-auto' : ''}`}
          >
            {icon} {label}
            {id === 'student-pdfs' && items.filter(i => i.fileUrl).length > 0 && (
              <span className="ml-1 bg-indigo-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                {items.filter(i => i.fileUrl).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Worksheet sub-tabs */}
      {mainTab === 'worksheet' && (
        <div className="flex gap-1.5 mb-4">
          {WORKSHEET_SUBS.map(({ id, label }) => (
            <button key={id} onClick={() => setWorksheetSub(id)}
              className={`tab-btn text-xs px-3 py-1.5 rounded-full border transition-all ${
                worksheetSub === id ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-200'
              }`}
            >{label}</button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[160px] max-w-[240px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="input pl-9" />
        </div>
        {isPDFTab ? (
          <select className="input max-w-[180px]" value={studentFilter} onChange={(e) => setStudentFilter(e.target.value)}>
            <option value="All">All Students</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        ) : (
          <>
            <select className="input max-w-[130px]" value={boardFilter} onChange={(e) => setBoardFilter(e.target.value)}>
              <option value="All">All Boards</option>
              {BOARDS.map((b) => <option key={b}>{b}</option>)}
            </select>
            <select className="input max-w-[130px]" value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)}>
              <option value="All">All Grades</option>
              {GRADES.map((g) => <option key={g} value={g}>Grade {g}</option>)}
            </select>
          </>
        )}
      </div>

      {/* Student PDFs tab content */}
      {isPDFTab ? (
        filtered.length === 0 ? (
          <div className="card text-center py-16">
            <File size={40} className="text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 font-medium mb-1">No PDF links added yet</p>
            <p className="text-slate-400 text-sm mb-4">Share Google Drive PDFs with students — just paste the link</p>
            <button onClick={openAdd} className="btn-primary btn-sm"><Plus size={14} /> Add PDF Link</button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((item) => (
              <div key={item.id} className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                  <File size={20} className="text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-900 text-sm truncate">{item.title}</div>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    {item.studentName && (
                      <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium">{item.studentName}</span>
                    )}
                    <span className="text-xs text-slate-500">{item.subject}</span>
                    {item.grade !== 'All' && <span className="text-xs text-slate-400">Grade {item.grade}</span>}
                    {item.fileName && <span className="text-xs text-slate-400 truncate max-w-[200px]">{item.fileName}</span>}
                    {item.fileSize && <span className="text-xs text-slate-400">{(item.fileSize / 1024).toFixed(0)} KB</span>}
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {item.fileUrl && (
                    <a
                      href={item.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-primary btn-sm"
                    >
                      <Eye size={13} /> View PDF
                    </a>
                  )}
                  {item.fileUrl && (
                    <a
                      href={item.fileUrl}
                      download={item.fileName}
                      className="btn-secondary btn-sm"
                    >
                      <Download size={13} /> Download
                    </a>
                  )}
                  <button onClick={() => openEdit(item)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400">
                    <Edit2 size={13} />
                  </button>
                  <button onClick={() => handleDelete(item)} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* Regular content grid */
        filtered.length === 0 ? (
          <div className="card text-center py-14">
            <BookOpen size={40} className="text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">No content yet in this category</p>
            <button onClick={openAdd} className="mt-3 btn-primary btn-sm"><Plus size={14} /> Create</button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((item) => (
              <div key={item.id} className="card p-4 hover:shadow-md transition-shadow flex flex-col">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0 pr-2">
                    <h3 className="font-semibold text-slate-900 text-sm leading-snug truncate">{item.title}</h3>
                    {item.description && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{item.description}</p>}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => setViewing(item)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600"><Eye size={13} /></button>
                    <button onClick={() => openEdit(item)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600"><Edit2 size={13} /></button>
                    <button onClick={() => handleDelete(item)} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500"><Trash2 size={13} /></button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  <Badge label={item.board} color={item.board === 'All' ? 'slate' : boardColor(item.board as string)} />
                  <Badge label={`Gr. ${item.grade}`} color="slate" />
                  <Badge label={item.subject} color="blue" />
                  {item.forLD && <Badge label="LD" color="purple" />}
                  {item.fileUrl && <Badge label="PDF" color="red" />}
                </div>
                {(item.type === 'quiz' || item.type === 'test') && (
                  <div className="text-xs text-slate-400 mb-3">
                    {item.questions?.length ?? 0} questions · {item.totalMarks} marks{item.duration ? ` · ${item.duration} min` : ''}
                  </div>
                )}
                <div className="mt-auto pt-2 border-t border-slate-100 flex gap-2">
                  <button onClick={() => printContent(item)} className="btn-secondary btn-sm flex-1 justify-center">
                    <Printer size={13} /> Print PDF
                  </button>
                  {item.fileUrl && (
                    <a href={item.fileUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm">
                      <File size={13} /> File
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* View Modal */}
      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing?.title ?? ''} size="xl">
        {viewing && (
          <div>
            <div className="flex flex-wrap gap-2 mb-4">
              <Badge label={viewing.board} color={viewing.board === 'All' ? 'slate' : boardColor(viewing.board as string)} />
              <Badge label={`Grade ${viewing.grade}`} color="slate" />
              <Badge label={viewing.subject} color="blue" />
              {viewing.forLD && <Badge label="LD Adapted" color="purple" />}
              {viewing.studentName && <Badge label={viewing.studentName} color="indigo" />}
            </div>
            {viewing.description && <p className="text-slate-600 text-sm mb-4">{viewing.description}</p>}
            {viewing.fileUrl && (
              <div className="flex gap-3 mb-4 p-3 bg-red-50 rounded-xl border border-red-100">
                <File size={20} className="text-red-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-800 truncate">{viewing.fileName}</div>
                  {viewing.fileSize && <div className="text-xs text-slate-500">{(viewing.fileSize / 1024).toFixed(0)} KB</div>}
                </div>
                <div className="flex gap-2">
                  <a href={viewing.fileUrl} target="_blank" rel="noopener noreferrer" className="btn-primary btn-sm">
                    <Eye size={13} /> Open
                  </a>
                  <a href={viewing.fileUrl} download={viewing.fileName} className="btn-secondary btn-sm">
                    <Download size={13} />
                  </a>
                </div>
              </div>
            )}
            {viewing.body && (
              <div className="bg-slate-50 rounded-xl p-4 mb-4">
                <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">{viewing.body}</pre>
              </div>
            )}
            {viewing.questions?.map((q, i) => (
              <div key={q.id} className="border border-slate-200 rounded-xl p-4 mb-3">
                <div className="flex items-start gap-3 mb-3">
                  <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900">{q.text}</p>
                    <span className="text-xs text-slate-400">{q.marks} mark{q.marks > 1 ? 's' : ''}</span>
                  </div>
                </div>
                {q.type === 'mcq' && q.options && (
                  <div className="grid grid-cols-2 gap-2 ml-9">
                    {q.options.filter(Boolean).map((o, oi) => (
                      <div key={oi} className={`text-xs px-3 py-1.5 rounded-lg border ${o === q.answer ? 'bg-green-50 border-green-300 text-green-700 font-medium' : 'bg-slate-50 border-slate-200'}`}>
                        {String.fromCharCode(65 + oi)}. {o}
                      </div>
                    ))}
                  </div>
                )}
                {q.answer && q.type !== 'mcq' && (
                  <div className="ml-9 text-xs text-green-700 bg-green-50 px-3 py-1.5 rounded-lg mt-2">Answer: {q.answer}</div>
                )}
              </div>
            ))}
            {!viewing.fileUrl && (
              <button onClick={() => printContent(viewing)} className="btn-primary mt-2"><Printer size={16} /> Export PDF</button>
            )}
          </div>
        )}
      </Modal>

      {/* Create/Edit Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Content' : isPDFTab ? 'Add PDF Link' : 'Create Content'} size="xl">
        <div className="space-y-4">
          <div>
            <label className="label">Title *</label>
            <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g., Chapter 3 – Fractions Notes" />
          </div>

          {/* Student selector */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">For Student (optional)</label>
              <select className="input" value={form.studentId} onChange={(e) => handleStudentChange(e.target.value)}>
                <option value="">General (all students)</option>
                {students.map((s) => <option key={s.id} value={s.id}>{s.name} — Grade {s.grade}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Subject</label>
              <select className="input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}>
                {SUBJECTS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {!isPDFTab && (
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Content Type</label>
                <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as ContentType })}>
                  <optgroup label="Worksheets">
                    <option value="grammar-worksheet">Grammar Worksheet</option>
                    <option value="maths-practice">Maths Practice</option>
                    <option value="worksheet">General Worksheet</option>
                  </optgroup>
                  <option value="study-material">Study Material</option>
                  <option value="quiz">Quiz</option>
                  <option value="test">Test</option>
                  <option value="writing-skills">Writing Skills</option>
                  <option value="ld-material">LD Material</option>
                </select>
              </div>
              <div>
                <label className="label">Board</label>
                <select className="input" value={form.board} onChange={(e) => setForm({ ...form, board: e.target.value as Board | 'All' })}>
                  <option value="All">All Boards</option>
                  {BOARDS.map((b) => <option key={b}>{b}</option>)}
                </select>
              </div>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Grade / Standard</label>
              <select
                className="input"
                value={form.grade}
                onChange={(e) => {
                  setForm({ ...form, grade: e.target.value })
                  if (e.target.value !== 'Others') setGradeOther('')
                }}
              >
                <option value="All">All Grades</option>
                {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
              {form.grade === 'Others' && (
                <input
                  className={`input mt-2 ${!gradeOther.trim() ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : ''}`}
                  placeholder="Please specify (e.g. IIT JEE, NEET) *"
                  value={gradeOther}
                  onChange={(e) => setGradeOther(e.target.value)}
                  autoFocus
                />
              )}
            </div>
            {isQnA && (
              <div>
                <label className="label">Duration (minutes)</label>
                <input type="number" className="input" min={1} value={form.duration} onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })} />
              </div>
            )}
          </div>

          <div>
            <label className="label">Description (optional)</label>
            <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Brief description..." />
          </div>

          {/* Google Drive Link */}
          <div>
            <label className="label">
              Google Drive Link {isPDFTab ? '*' : '(optional)'}
            </label>
            <div className="relative">
              <Link size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="input pl-9"
                value={form.fileUrl}
                onChange={(e) => setForm({ ...form, fileUrl: e.target.value })}
                placeholder="https://drive.google.com/file/d/…/view?usp=sharing"
              />
            </div>
            <p className="text-xs text-slate-400 mt-1.5 flex items-start gap-1">
              <span>💡</span>
              <span>
                In Google Drive: right-click the file → <strong>Share</strong> → set access to
                <strong> "Anyone with the link"</strong> → Copy link → paste above.
              </span>
            </p>
          </div>

          {/* Optional display name */}
          <div>
            <label className="label">File Name (optional)</label>
            <input
              className="input"
              value={form.fileName}
              onChange={(e) => setForm({ ...form, fileName: e.target.value })}
              placeholder="e.g. Chapter 3 Notes.pdf"
            />
          </div>

          {!isQnA && !isPDFTab && (
            <div>
              <label className="label">Content Body</label>
              <textarea className="input resize-none" rows={6} value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                placeholder="Write the content here..." />
            </div>
          )}

          <div className="flex items-center gap-2">
            <input type="checkbox" id="forLD" checked={form.forLD}
              onChange={(e) => setForm({ ...form, forLD: e.target.checked })}
              className="w-4 h-4 rounded accent-indigo-600" />
            <label htmlFor="forLD" className="text-sm text-slate-700 flex items-center gap-1.5">
              <Brain size={14} className="text-purple-500" />
              Adapted for Learning Disabilities
            </label>
          </div>

          {/* Question Builder */}
          {isQnA && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="label mb-0">Questions ({form.questions?.length ?? 0})</label>
                <button type="button" onClick={addQuestion} className="btn-primary btn-sm"><Plus size={13} /> Add Question</button>
              </div>
              <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
                {(form.questions ?? []).map((q, qi) => (
                  <div key={qi} className="border border-slate-200 rounded-xl p-3 bg-slate-50">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-bold">{qi + 1}</span>
                      <select className="input py-1 text-xs max-w-[120px]" value={q.type}
                        onChange={(e) => updateQuestion(qi, { type: e.target.value as Question['type'] })}>
                        <option value="mcq">MCQ</option>
                        <option value="short">Short Answer</option>
                        <option value="long">Long Answer</option>
                        <option value="fill">Fill in Blank</option>
                      </select>
                      <input type="number" className="input py-1 text-xs max-w-[70px]" value={q.marks} min={1}
                        onChange={(e) => {
                          updateQuestion(qi, { marks: Number(e.target.value) })
                          setTimeout(() => setForm((f) => ({ ...f, totalMarks: (f.questions ?? []).reduce((s, q) => s + q.marks, 0) })), 50)
                        }} placeholder="Marks" />
                      <button onClick={() => removeQuestion(qi)} className="ml-auto p-1 hover:bg-red-50 rounded text-slate-400 hover:text-red-500"><Trash2 size={12} /></button>
                    </div>
                    <input className="input text-sm mb-2" value={q.text} onChange={(e) => updateQuestion(qi, { text: e.target.value })} placeholder="Question text..." />
                    {q.type === 'mcq' && (
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        {(q.options ?? ['', '', '', '']).map((o, oi) => (
                          <input key={oi} className="input text-xs" value={o}
                            onChange={(e) => updateOption(qi, oi, e.target.value)} placeholder={`Option ${String.fromCharCode(65 + oi)}`} />
                        ))}
                      </div>
                    )}
                    {q.type !== 'long' && (
                      <input className="input text-xs" value={q.answer}
                        onChange={(e) => updateQuestion(qi, { answer: e.target.value })}
                        placeholder={q.type === 'mcq' ? 'Correct option (A/B/C/D)' : 'Answer key'} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button onClick={handleSave} className="btn-primary flex-1">
              {editing ? 'Save Changes' : isPDFTab ? 'Save PDF Link' : 'Create Content'}
            </button>
            <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
