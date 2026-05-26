import { useState } from 'react'
import { Plus, Search, User, Phone, Edit2, Trash2, BookOpen, Brain } from 'lucide-react'
import { useStudents } from '../hooks/useStudents'
import { Modal } from '../components/ui/Modal'
import { Badge, boardColor } from '../components/ui/Badge'
import { PageSkeleton } from '../components/ui/Skeleton'
import { Student, BOARDS, GRADES, STANDARD_GRADES, SUBJECTS, Board, BillingType } from '../types'
import toast from 'react-hot-toast'

const emptyForm = {
  name: '', grade: '5', board: 'CBSE' as Board,
  subjects: [] as string[], billingType: 'hourly' as BillingType,
  hourlyRate: 0, monthlyFee: 0,
  parentName: '', phone: '', email: '',
  hasLD: false, notes: '', active: true,
}

export default function Students() {
  const { students, loading, addStudent, updateStudent, deleteStudent } = useStudents()
  const [search, setSearch] = useState('')
  const [boardFilter, setBoardFilter] = useState<string>('All')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Student | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  // "Others" grade: separate text state so the custom value is mandatory
  const [gradeOther, setGradeOther] = useState('')

  const filtered = students.filter((s) => {
    const q = search.toLowerCase()
    return (
      (boardFilter === 'All' || s.board === boardFilter) &&
      (s.name.toLowerCase().includes(q) ||
        s.grade.includes(q) ||
        s.parentName?.toLowerCase().includes(q))
    )
  })

  const openAdd = () => {
    setEditing(null)
    setForm({ ...emptyForm })
    setGradeOther('')
    setShowForm(true)
  }

  const openEdit = (s: Student) => {
    setEditing(s)
    // If stored grade is not a standard option, it was a custom "Others" value
    const isCustomGrade = !STANDARD_GRADES.includes(s.grade)
    setGradeOther(isCustomGrade ? s.grade : '')
    setForm({
      name: s.name, grade: isCustomGrade ? 'Others' : s.grade, board: s.board,
      subjects: s.subjects ?? [], billingType: s.billingType,
      hourlyRate: s.hourlyRate ?? 0, monthlyFee: s.monthlyFee ?? 0,
      parentName: s.parentName, phone: s.phone, email: s.email ?? '',
      hasLD: s.hasLD, notes: s.notes ?? '', active: s.active,
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.parentName.trim() || !form.phone.trim()) {
      toast.error('Name, parent name, and phone are required')
      return
    }
    if (form.grade === 'Others' && !gradeOther.trim()) {
      toast.error('Please specify the grade / standard')
      return
    }
    try {
      const data = {
        ...form,
        grade: form.grade === 'Others' ? gradeOther.trim() : form.grade,
        hourlyRate: Number(form.hourlyRate),
        monthlyFee: Number(form.monthlyFee),
      }
      if (editing) {
        await updateStudent(editing.id, data)
        toast.success('Student updated')
      } else {
        await addStudent(data)
        toast.success('Student added')
      }
      setShowForm(false)
    } catch {
      toast.error('Something went wrong')
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return
    await deleteStudent(id)
    toast.success('Student deleted')
  }

  const toggleSubject = (sub: string) => {
    setForm((f) => ({
      ...f,
      subjects: f.subjects.includes(sub)
        ? f.subjects.filter((s) => s !== sub)
        : [...f.subjects, sub],
    }))
  }

  if (loading) return <PageSkeleton />

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Students</h1>
          <p className="text-slate-500 text-sm mt-0.5">{students.length} total · {students.filter((s) => s.active).length} active</p>
        </div>
        <button onClick={openAdd} className="btn-primary">
          <Plus size={16} /> Add Student
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, grade..."
            className="input pl-9"
          />
        </div>
        <div className="flex gap-1.5">
          {['All', ...BOARDS].map((b) => (
            <button
              key={b}
              onClick={() => setBoardFilter(b)}
              className={`tab-btn ${boardFilter === b ? 'active' : ''}`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      {/* Student Grid */}
      {filtered.length === 0 ? (
        <EmptyState onAdd={openAdd} />
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((s) => (
            <div key={s.id} className={`card p-4 hover:shadow-md transition-shadow ${!s.active ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-sm flex-shrink-0">
                    {s.name[0]?.toUpperCase()}
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900 text-sm">{s.name}</div>
                    <div className="text-xs text-slate-500">Grade {s.grade}</div>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
                    <Edit2 size={14} />
                  </button>
                  <button onClick={() => handleDelete(s.id, s.name)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 mb-3">
                <Badge label={s.board} color={boardColor(s.board)} />
                {s.billingType === 'hourly'
                  ? <Badge label={`₹${s.hourlyRate}/hr`} color="green" />
                  : <Badge label={`₹${s.monthlyFee}/mo`} color="blue" />
                }
                {s.hasLD && <Badge label="LD" color="purple" />}
                {!s.active && <Badge label="Inactive" color="red" />}
              </div>

              {s.subjects?.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {s.subjects.map((sub) => (
                    <span key={sub} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{sub}</span>
                  ))}
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 space-y-1">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <User size={12} /> {s.parentName}
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Phone size={12} /> {s.phone}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? 'Edit Student' : 'Add New Student'}
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Student Name *</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" />
            </div>
            <div>
              <label className="label">Grade / Standard *</label>
              <select
                className="input"
                value={form.grade}
                onChange={(e) => {
                  setForm({ ...form, grade: e.target.value })
                  if (e.target.value !== 'Others') setGradeOther('')
                }}
              >
                {GRADES.map((g) => <option key={g}>{g}</option>)}
              </select>
              {form.grade === 'Others' && (
                <input
                  className={`input mt-2 ${!gradeOther.trim() ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : ''}`}
                  placeholder="Please specify (e.g. IIT JEE, NEET, CET) *"
                  value={gradeOther}
                  onChange={(e) => setGradeOther(e.target.value)}
                  autoFocus
                />
              )}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Board *</label>
              <select className="input" value={form.board} onChange={(e) => setForm({ ...form, board: e.target.value as Board })}>
                {BOARDS.map((b) => <option key={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Billing Type *</label>
              <select className="input" value={form.billingType} onChange={(e) => setForm({ ...form, billingType: e.target.value as BillingType })}>
                <option value="hourly">Hourly Rate</option>
                <option value="monthly">Monthly Fixed Fee</option>
              </select>
            </div>
          </div>

          {form.billingType === 'hourly' ? (
            <div>
              <label className="label">Hourly Rate (₹)</label>
              <input className="input" type="number" min={0} value={form.hourlyRate} onChange={(e) => setForm({ ...form, hourlyRate: Number(e.target.value) })} />
            </div>
          ) : (
            <div>
              <label className="label">Monthly Fee (₹)</label>
              <input className="input" type="number" min={0} value={form.monthlyFee} onChange={(e) => setForm({ ...form, monthlyFee: Number(e.target.value) })} />
            </div>
          )}

          <div>
            <label className="label">Subjects</label>
            <div className="flex flex-wrap gap-2">
              {SUBJECTS.map((sub) => (
                <button
                  key={sub}
                  type="button"
                  onClick={() => toggleSubject(sub)}
                  className={`px-3 py-1.5 text-xs rounded-full border transition-all ${
                    form.subjects.includes(sub)
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                  }`}
                >
                  {sub}
                </button>
              ))}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Parent / Guardian Name *</label>
              <input className="input" value={form.parentName} onChange={(e) => setForm({ ...form, parentName: e.target.value })} placeholder="Parent name" />
            </div>
            <div>
              <label className="label">Phone *</label>
              <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91 98765 43210" />
            </div>
          </div>

          <div>
            <label className="label">Email (optional)</label>
            <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="parent@email.com" />
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.hasLD}
                onChange={(e) => setForm({ ...form, hasLD: e.target.checked })}
                className="w-4 h-4 rounded accent-indigo-600"
              />
              <span className="text-sm text-slate-700 flex items-center gap-1.5">
                <Brain size={14} className="text-purple-500" />
                Has Learning Disability
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="w-4 h-4 rounded accent-indigo-600"
              />
              <span className="text-sm text-slate-700">Active</span>
            </label>
          </div>

          <div>
            <label className="label">Notes (optional)</label>
            <textarea className="input resize-none" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Any special notes about this student..." />
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={handleSave} className="btn-primary flex-1">
              {editing ? 'Save Changes' : 'Add Student'}
            </button>
            <button onClick={() => setShowForm(false)} className="btn-secondary">
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="text-center py-16 card">
      <User size={48} className="text-slate-200 mx-auto mb-3" />
      <h3 className="font-semibold text-slate-700 mb-1">No students yet</h3>
      <p className="text-slate-400 text-sm mb-4">Add your first student to get started</p>
      <button onClick={onAdd} className="btn-primary">
        <Plus size={16} /> Add Student
      </button>
    </div>
  )
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
