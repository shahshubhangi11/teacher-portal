import { useState, useMemo } from 'react'
import { format } from 'date-fns'
import { Plus, FileText, Edit2, Trash2, Search, Tag } from 'lucide-react'
import { useNotes } from '../hooks/useNotes'
import { useStudents } from '../hooks/useStudents'
import { Modal } from '../components/ui/Modal'
import { PageSkeleton } from '../components/ui/Skeleton'
import { Note, SUBJECTS } from '../types'
import toast from 'react-hot-toast'

const emptyForm = {
  studentId: '', studentName: '', date: format(new Date(), 'yyyy-MM-dd'),
  subject: '', content: '', tags: [] as string[],
}

export default function Notes() {
  const { notes, loading, addNote, updateNote, deleteNote } = useNotes()
  const { students } = useStudents()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Note | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [search, setSearch] = useState('')
  const [filterStudent, setFilterStudent] = useState('All')
  const [tagInput, setTagInput] = useState('')
  const [selectedDate, setSelectedDate] = useState('')

  const filtered = useMemo(() => {
    return notes.filter((n) => {
      if (filterStudent !== 'All' && n.studentId !== filterStudent) return false
      if (selectedDate && n.date !== selectedDate) return false
      if (search) {
        const q = search.toLowerCase()
        return n.content.toLowerCase().includes(q) ||
          n.studentName.toLowerCase().includes(q) ||
          n.subject?.toLowerCase().includes(q) ||
          n.tags.some((t) => t.toLowerCase().includes(q))
      }
      return true
    })
  }, [notes, filterStudent, selectedDate, search])

  // Group by date
  const grouped = useMemo(() => {
    const map: Record<string, Note[]> = {}
    filtered.forEach((n) => {
      if (!map[n.date]) map[n.date] = []
      map[n.date].push(n)
    })
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a))
  }, [filtered])

  const openAdd = () => {
    setEditing(null)
    setForm({ ...emptyForm })
    setShowForm(true)
  }

  const openEdit = (n: Note) => {
    setEditing(n)
    setForm({
      studentId: n.studentId, studentName: n.studentName,
      date: n.date, subject: n.subject ?? '', content: n.content, tags: n.tags,
    })
    setShowForm(true)
  }

  const handleStudentChange = (studentId: string) => {
    const s = students.find((s) => s.id === studentId)
    setForm({ ...form, studentId, studentName: s?.name ?? '', subject: s?.subjects?.[0] ?? '' })
  }

  const addTag = () => {
    const t = tagInput.trim()
    if (t && !form.tags.includes(t)) {
      setForm({ ...form, tags: [...form.tags, t] })
    }
    setTagInput('')
  }

  const removeTag = (tag: string) => {
    setForm({ ...form, tags: form.tags.filter((t) => t !== tag) })
  }

  const handleSave = async () => {
    if (!form.studentId || !form.content.trim()) {
      toast.error('Student and content are required')
      return
    }
    try {
      if (editing) {
        await updateNote(editing.id, form)
        toast.success('Note updated')
      } else {
        await addNote(form)
        toast.success('Note added')
      }
      setShowForm(false)
    } catch {
      toast.error('Something went wrong')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this note?')) return
    await deleteNote(id)
    toast.success('Note deleted')
  }

  if (loading) return <PageSkeleton count={4} />

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Notes</h1>
          <p className="text-slate-500 text-sm mt-0.5">Daily teaching notes & observations</p>
        </div>
        <button onClick={openAdd} className="btn-primary">
          <Plus size={16} /> Add Note
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search notes..." className="input pl-9" />
        </div>
        <select className="input max-w-[180px]" value={filterStudent} onChange={(e) => setFilterStudent(e.target.value)}>
          <option value="All">All Students</option>
          {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input
          type="date"
          className="input max-w-[160px]"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
        />
        {selectedDate && (
          <button onClick={() => setSelectedDate('')} className="btn-secondary btn-sm">Clear date</button>
        )}
      </div>

      {/* Notes grouped by date */}
      {grouped.length === 0 ? (
        <div className="card text-center py-16">
          <FileText size={40} className="text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">No notes found</p>
          <button onClick={openAdd} className="mt-3 btn-primary btn-sm"><Plus size={14} /> Add Note</button>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([date, dateNotes]) => (
            <div key={date}>
              <div className="flex items-center gap-3 mb-3">
                <h3 className="font-semibold text-slate-700 text-sm">
                  {format(new Date(date + 'T00:00:00'), 'EEEE, MMMM d, yyyy')}
                </h3>
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-xs text-slate-400">{dateNotes.length} note{dateNotes.length > 1 ? 's' : ''}</span>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {dateNotes.map((n) => (
                  <div key={n.id} className="card p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <span className="font-medium text-slate-900 text-sm">{n.studentName}</span>
                        {n.subject && <span className="text-xs text-slate-400 ml-2">· {n.subject}</span>}
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(n)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400">
                          <Edit2 size={13} />
                        </button>
                        <button onClick={() => handleDelete(n.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{n.content}</p>
                    {n.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {n.tags.map((t) => (
                          <span key={t} className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
                            <Tag size={10} /> {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Note' : 'New Note'} size="lg">
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Student *</label>
              <select className="input" value={form.studentId} onChange={(e) => handleStudentChange(e.target.value)}>
                <option value="">Select student…</option>
                {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Date *</label>
              <input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
          </div>

          <div>
            <label className="label">Subject (optional)</label>
            <select className="input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}>
              <option value="">None</option>
              {SUBJECTS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Note Content *</label>
            <textarea
              className="input resize-none"
              rows={6}
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder="What was covered today? How did the student perform? Any observations..."
            />
          </div>

          <div>
            <label className="label">Tags</label>
            <div className="flex gap-2 mb-2">
              <input
                className="input flex-1"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                placeholder="Add tag and press Enter"
              />
              <button onClick={addTag} type="button" className="btn-secondary">Add</button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {form.tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full">
                  {t}
                  <button onClick={() => removeTag(t)} className="hover:text-red-500 ml-0.5">×</button>
                </span>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={handleSave} className="btn-primary flex-1">
              {editing ? 'Save Changes' : 'Add Note'}
            </button>
            <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      </Modal>
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
