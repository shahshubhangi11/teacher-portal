import { useState, useMemo } from 'react'
import { format } from 'date-fns'
import {
  Sparkles, Brain, RefreshCw, Wand2, Plus, Trash2,
  BookOpen, ChevronDown, ChevronUp, Save, Loader2, AlertCircle,
} from 'lucide-react'
import { generateQuiz, generateInsights, QuizGenParams } from '../lib/ai'
import { useStudents } from '../hooks/useStudents'
import { useSessions } from '../hooks/useSessions'
import { useNotes } from '../hooks/useNotes'
import { useBilling } from '../hooks/useBilling'
import { useContent } from '../hooks/useContent'
import { useAuth } from '../contexts/AuthContext'
import { BOARDS, GRADES, SUBJECTS } from '../types'
import type { Question, ContentType } from '../types'
import toast from 'react-hot-toast'

const DIFFICULTIES = ['easy', 'medium', 'hard'] as const
const Q_TYPES = [
  { id: 'mcq',   label: 'Multiple Choice (MCQ)' },
  { id: 'short', label: 'Short Answer' },
  { id: 'fill',  label: 'Fill in the Blank' },
  { id: 'long',  label: 'Long Answer / Essay' },
]

export default function AIInsights() {
  const { user } = useAuth()
  const { students } = useStudents()
  const { sessions } = useSessions()
  const { notes } = useNotes()
  const { totalEarned, totalPending } = useBilling()
  const { addContent } = useContent()

  const [activeTab, setActiveTab] = useState<'insights' | 'quiz'>('insights')

  // ── Insights state ──────────────────────────────────────────────
  const [insights, setInsights] = useState<string>('')
  const [insightsLoading, setInsightsLoading] = useState(false)

  // ── Quiz gen state ──────────────────────────────────────────────
  const [quizForm, setQuizForm] = useState<QuizGenParams>({
    topic: '', subject: 'English', grade: '5', board: 'CBSE',
    difficulty: 'medium', numQuestions: 5,
    questionTypes: ['mcq', 'short'], context: '',
  })
  const [generatedQuestions, setGeneratedQuestions] = useState<Question[]>([])
  const [quizLoading, setQuizLoading] = useState(false)
  const [quizTitle, setQuizTitle] = useState('')
  const [savingQuiz, setSavingQuiz] = useState(false)
  const [expandedQ, setExpandedQ] = useState<number | null>(null)

  // ── Build insights data ─────────────────────────────────────────
  const insightsData = useMemo(() => {
    const thisMonth = format(new Date(), 'yyyy-MM')
    const monthSessions = sessions.filter((s) => s.date.startsWith(thisMonth))
    const bySubject: Record<string, number> = {}
    sessions.forEach((s) => { bySubject[s.subject] = (bySubject[s.subject] ?? 0) + 1 })

    const byBoard: Record<string, number> = {}
    students.forEach((s) => { byBoard[s.board] = (byBoard[s.board] ?? 0) + 1 })

    const sessionsByStudent: Record<string, number> = {}
    sessions.filter((s) => s.status === 'completed').forEach((s) => {
      sessionsByStudent[s.studentId] = (sessionsByStudent[s.studentId] ?? 0) + 1
    })

    const totalCompleted = Object.values(sessionsByStudent).reduce((a, b) => a + b, 0)
    const avgSessions = students.length ? totalCompleted / students.length : 0

    const lowAttendance = students
      .filter((st) => {
        const count = sessionsByStudent[st.id] ?? 0
        const scheduled = sessions.filter((s) => s.studentId === st.id).length
        return scheduled > 3 && count / scheduled < 0.7
      })
      .map((s) => s.name)

    const topStudents = Object.entries(sessionsByStudent)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id]) => students.find((s) => s.id === id)?.name ?? id)

    const recentNoteTopics = [...new Set(notes.slice(0, 10).map((n) => n.subject ?? 'General').filter(Boolean))]

    return {
      totalStudents: students.length,
      activeStudents: students.filter((s) => s.active).length,
      boards: byBoard,
      sessionsThisMonth: monthSessions.length,
      sessionsBySubject: bySubject,
      avgSessionsPerStudent: Math.round(avgSessions * 10) / 10,
      pendingAmount: totalPending,
      paidAmount: totalEarned,
      studentsWithLD: students.filter((s) => s.hasLD).length,
      recentNoteTopics,
      lowAttendanceStudents: lowAttendance,
      topStudents,
    }
  }, [students, sessions, notes, totalEarned, totalPending])

  const handleGenerateInsights = async () => {
    if (!import.meta.env.VITE_GEMINI_API_KEY) {
      toast.error('Add VITE_GEMINI_API_KEY to your .env file first')
      return
    }
    setInsightsLoading(true)
    try {
      const text = await generateInsights(insightsData)
      setInsights(text)
    } catch (e: any) {
      toast.error(e.message ?? 'AI failed — check your Gemini API key')
    } finally {
      setInsightsLoading(false)
    }
  }

  const toggleQType = (t: string) => {
    setQuizForm((f) => ({
      ...f,
      questionTypes: f.questionTypes.includes(t as any)
        ? f.questionTypes.filter((q) => q !== t)
        : [...f.questionTypes, t as any],
    }))
  }

  const handleGenerateQuiz = async () => {
    if (!quizForm.topic.trim()) { toast.error('Enter a topic first'); return }
    if (quizForm.questionTypes.length === 0) { toast.error('Select at least one question type'); return }
    if (!import.meta.env.VITE_GEMINI_API_KEY) {
      toast.error('Add VITE_GEMINI_API_KEY to your .env file first')
      return
    }
    setQuizLoading(true)
    setGeneratedQuestions([])
    try {
      const questions = await generateQuiz(quizForm)
      setGeneratedQuestions(questions)
      setQuizTitle(`${quizForm.topic} — ${quizForm.subject} Quiz`)
      toast.success(`${questions.length} questions generated!`)
    } catch (e: any) {
      toast.error(e.message ?? 'AI failed — check your Gemini API key')
    } finally {
      setQuizLoading(false)
    }
  }

  const updateQuestion = (idx: number, data: Partial<Question>) => {
    setGeneratedQuestions((qs) => qs.map((q, i) => (i === idx ? { ...q, ...data } : q)))
  }

  const removeQuestion = (idx: number) => {
    setGeneratedQuestions((qs) => qs.filter((_, i) => i !== idx))
  }

  const handleSaveQuiz = async () => {
    if (!quizTitle.trim()) { toast.error('Enter a quiz title'); return }
    if (generatedQuestions.length === 0) { toast.error('No questions to save'); return }
    setSavingQuiz(true)
    try {
      const totalMarks = generatedQuestions.reduce((s, q) => s + q.marks, 0)
      await addContent({
        title: quizTitle,
        type: 'quiz' as ContentType,
        board: quizForm.board as any,
        grade: quizForm.grade,
        subject: quizForm.subject,
        description: `AI-generated quiz on "${quizForm.topic}" — ${quizForm.difficulty} level`,
        body: '',
        questions: generatedQuestions,
        totalMarks,
        duration: Math.ceil(generatedQuestions.length * 2.5),
        tags: ['ai-generated', quizForm.topic.toLowerCase()],
        forLD: false,
        fileUrl: '', fileName: '', fileSize: 0,
        studentId: '', studentName: '',
      })
      toast.success('Quiz saved to Content Library!')
      setGeneratedQuestions([])
      setQuizTitle('')
    } catch {
      toast.error('Failed to save quiz')
    } finally {
      setSavingQuiz(false)
    }
  }

  const hasGeminiKey = !!import.meta.env.VITE_GEMINI_API_KEY

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
          <Sparkles size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">AI Tools</h1>
          <p className="text-slate-500 text-sm">Powered by Google Gemini</p>
        </div>
      </div>

      {!hasGeminiKey && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl mb-6">
          <AlertCircle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <span className="font-semibold">Gemini API key not found.</span> Add{' '}
            <code className="bg-amber-100 px-1 rounded">VITE_GEMINI_API_KEY=your_key</code> to your{' '}
            <code className="bg-amber-100 px-1 rounded">.env</code> file.{' '}
            Get a free key at{' '}
            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer"
              className="underline font-medium">aistudio.google.com</a>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button onClick={() => setActiveTab('insights')} className={`tab-btn flex items-center gap-2 ${activeTab === 'insights' ? 'active' : ''}`}>
          <Brain size={15} /> Student Insights
        </button>
        <button onClick={() => setActiveTab('quiz')} className={`tab-btn flex items-center gap-2 ${activeTab === 'quiz' ? 'active' : ''}`}>
          <Wand2 size={15} /> AI Quiz Generator
        </button>
      </div>

      {/* ── INSIGHTS TAB ─────────────────────────────────────── */}
      {activeTab === 'insights' && (
        <div className="space-y-5">
          {/* Quick Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total Students',     value: String(insightsData.totalStudents)               },
              { label: 'Sessions This Month', value: String(insightsData.sessionsThisMonth)          },
              { label: 'Pending Fees',        value: `₹${insightsData.pendingAmount.toLocaleString()}` },
              { label: 'Total Earned',        value: `₹${insightsData.paidAmount.toLocaleString()}`   },
            ].map(({ label, value }) => (
              <div key={label} className="card p-4 text-center">
                <div className="text-xl font-bold text-slate-900">{value}</div>
                <div className="text-xs text-slate-500 mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          {/* Subject breakdown */}
          {Object.keys(insightsData.sessionsBySubject).length > 0 && (
            <div className="card p-4">
              <h3 className="font-semibold text-slate-800 text-sm mb-3">Sessions by Subject</h3>
              <div className="space-y-2">
                {Object.entries(insightsData.sessionsBySubject)
                  .sort((a, b) => b[1] - a[1])
                  .map(([subj, count]) => {
                    const max = Math.max(...Object.values(insightsData.sessionsBySubject))
                    return (
                      <div key={subj} className="flex items-center gap-3">
                        <span className="text-xs text-slate-600 w-28 flex-shrink-0">{subj}</span>
                        <div className="flex-1 bg-slate-100 rounded-full h-2">
                          <div className="bg-indigo-500 h-2 rounded-full" style={{ width: `${(count / max) * 100}%` }} />
                        </div>
                        <span className="text-xs font-medium text-slate-700 w-6 text-right">{count}</span>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}

          {/* AI Insights panel */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <Sparkles size={16} className="text-indigo-500" />
                AI-Generated Insights
              </h3>
              <button
                onClick={handleGenerateInsights}
                disabled={insightsLoading || !hasGeminiKey}
                className="btn-primary btn-sm"
              >
                {insightsLoading
                  ? <><Loader2 size={13} className="animate-spin" /> Analysing…</>
                  : <><RefreshCw size={13} /> {insights ? 'Refresh' : 'Generate Insights'}</>
                }
              </button>
            </div>

            {!insights && !insightsLoading && (
              <div className="text-center py-10 text-slate-400">
                <Brain size={36} className="mx-auto mb-3 text-slate-200" />
                <p className="text-sm">Click "Generate Insights" to get AI-powered analysis of your students</p>
              </div>
            )}

            {insightsLoading && (
              <div className="space-y-3">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-4 bg-slate-100 rounded animate-pulse" style={{ width: `${70 + i * 5}%` }} />
                ))}
              </div>
            )}

            {insights && !insightsLoading && (
              <div className="space-y-2">
                {insights.split('\n').filter(Boolean).map((line, i) => (
                  <div key={i} className="flex items-start gap-2 p-3 rounded-lg bg-slate-50 text-sm text-slate-700">
                    {line}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── QUIZ GENERATOR TAB ─────────────────────────────── */}
      {activeTab === 'quiz' && (
        <div className="space-y-5">
          <div className="card p-5">
            <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Wand2 size={16} className="text-indigo-500" />
              Quiz Parameters
            </h3>

            <div className="space-y-4">
              {/* Topic — most important */}
              <div>
                <label className="label">Topic / Chapter *</label>
                <input
                  className="input text-base"
                  value={quizForm.topic}
                  onChange={(e) => setQuizForm({ ...quizForm, topic: e.target.value })}
                  placeholder="e.g.  Fractions — Addition & Subtraction,  The French Revolution,  Photosynthesis"
                />
              </div>

              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <label className="label">Subject</label>
                  <select className="input" value={quizForm.subject} onChange={(e) => setQuizForm({ ...quizForm, subject: e.target.value })}>
                    {SUBJECTS.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Grade</label>
                  <select className="input" value={quizForm.grade} onChange={(e) => setQuizForm({ ...quizForm, grade: e.target.value })}>
                    {GRADES.map((g) => <option key={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Board</label>
                  <select className="input" value={quizForm.board} onChange={(e) => setQuizForm({ ...quizForm, board: e.target.value })}>
                    {BOARDS.map((b) => <option key={b}>{b}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Difficulty</label>
                  <div className="flex gap-2">
                    {DIFFICULTIES.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setQuizForm({ ...quizForm, difficulty: d })}
                        className={`flex-1 py-2 text-xs font-semibold rounded-lg border capitalize transition-all ${
                          quizForm.difficulty === d
                            ? d === 'easy' ? 'bg-green-600 border-green-600 text-white'
                              : d === 'medium' ? 'bg-amber-500 border-amber-500 text-white'
                              : 'bg-red-600 border-red-600 text-white'
                            : 'border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >{d}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="label">Number of Questions</label>
                  <div className="flex gap-1.5">
                    {[3, 5, 8, 10, 15].map((n) => (
                      <button key={n} type="button"
                        onClick={() => setQuizForm({ ...quizForm, numQuestions: n })}
                        className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all ${
                          quizForm.numQuestions === n ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-200 text-slate-600 hover:border-indigo-300'
                        }`}
                      >{n}</button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="label">Question Types</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {Q_TYPES.map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleQType(id)}
                      className={`p-2.5 text-xs font-medium rounded-lg border transition-all text-left ${
                        quizForm.questionTypes.includes(id as any)
                          ? 'bg-indigo-50 border-indigo-400 text-indigo-700'
                          : 'border-slate-200 text-slate-600 hover:border-indigo-200'
                      }`}
                    >
                      {quizForm.questionTypes.includes(id as any) && <span className="mr-1">✓</span>}
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="label">Extra context / chapter notes (optional)</label>
                <textarea
                  className="input resize-none"
                  rows={3}
                  value={quizForm.context}
                  onChange={(e) => setQuizForm({ ...quizForm, context: e.target.value })}
                  placeholder="Paste key points, definitions, or chapter summary here to make questions more specific…"
                />
              </div>

              <button
                onClick={handleGenerateQuiz}
                disabled={quizLoading || !quizForm.topic.trim() || !hasGeminiKey || quizForm.questionTypes.length === 0}
                className="btn-primary w-full justify-center py-3"
              >
                {quizLoading
                  ? <><Loader2 size={16} className="animate-spin" /> Generating questions…</>
                  : <><Wand2 size={16} /> Generate Quiz with AI</>
                }
              </button>
            </div>
          </div>

          {/* Generated Questions Preview */}
          {generatedQuestions.length > 0 && (
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-900">
                  Generated Questions ({generatedQuestions.length})
                  <span className="ml-2 text-xs font-normal text-slate-400">
                    Total: {generatedQuestions.reduce((s, q) => s + q.marks, 0)} marks
                  </span>
                </h3>
                <span className="text-xs text-slate-400">Review & edit before saving</span>
              </div>

              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {generatedQuestions.map((q, i) => (
                  <div key={i} className="border border-slate-200 rounded-xl overflow-hidden">
                    <button
                      className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 text-left"
                      onClick={() => setExpandedQ(expandedQ === i ? null : i)}
                    >
                      <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                      <span className="flex-1 text-sm font-medium text-slate-800 truncate">{q.text}</span>
                      <span className="text-xs text-slate-400 flex-shrink-0">{q.marks}m · {q.type}</span>
                      <button onClick={(e) => { e.stopPropagation(); removeQuestion(i) }}
                        className="p-1 hover:bg-red-50 rounded text-slate-300 hover:text-red-500">
                        <Trash2 size={12} />
                      </button>
                      {expandedQ === i ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                    </button>

                    {expandedQ === i && (
                      <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-2">
                        <textarea
                          className="input resize-none text-sm"
                          rows={2}
                          value={q.text}
                          onChange={(e) => updateQuestion(i, { text: e.target.value })}
                        />
                        {q.type === 'mcq' && (
                          <div className="grid grid-cols-2 gap-2">
                            {(q.options ?? []).map((o, oi) => (
                              <input key={oi} className="input text-xs" value={o}
                                onChange={(e) => {
                                  const opts = [...(q.options ?? [])]
                                  opts[oi] = e.target.value
                                  updateQuestion(i, { options: opts })
                                }}
                                placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                              />
                            ))}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <label className="text-xs text-slate-400 mb-1 block">Answer / Key</label>
                            <input className="input text-xs" value={q.answer ?? ''}
                              onChange={(e) => updateQuestion(i, { answer: e.target.value })} />
                          </div>
                          <div className="w-20">
                            <label className="text-xs text-slate-400 mb-1 block">Marks</label>
                            <input type="number" className="input text-xs" min={1} value={q.marks}
                              onChange={(e) => updateQuestion(i, { marks: Number(e.target.value) })} />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Save Quiz */}
              <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
                <div>
                  <label className="label">Quiz Title</label>
                  <input className="input" value={quizTitle} onChange={(e) => setQuizTitle(e.target.value)}
                    placeholder="e.g. Fractions Quiz — Grade 5" />
                </div>
                <button
                  onClick={handleSaveQuiz}
                  disabled={savingQuiz || !quizTitle.trim()}
                  className="btn-primary w-full justify-center"
                >
                  {savingQuiz
                    ? <><Loader2 size={15} className="animate-spin" /> Saving…</>
                    : <><Save size={15} /> Save to Content Library</>
                  }
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
