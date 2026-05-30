import { useState, useMemo, useRef, useEffect } from 'react'
import { format } from 'date-fns'
import {
  Sparkles, Brain, RefreshCw, Wand2, Plus, Trash2,
  BookOpen, ChevronDown, ChevronUp, Save, Loader2, AlertCircle,
  FileText, Check, ChevronsUpDown,
} from 'lucide-react'
import { generateQuiz, generateInsights, generateFromPDF, extractTopicsFromURL, QuizGenParams } from '../lib/ai'
import { callWithRetry } from '../lib/retry'
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
  const { addContent, items: contentItems } = useContent()

  const [activeTab, setActiveTab] = useState<'insights' | 'quiz' | 'pdf'>('insights')

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

  // ── PDF → Content state ─────────────────────────────────────────
  const [pdfStudentId, setPdfStudentId]         = useState('')
  const [pdfContentId, setPdfContentId]         = useState('')
  const [pdfSubject, setPdfSubject]             = useState('English')
  const [pdfContentType, setPdfContentType]     = useState<'worksheet'|'quiz'|'test'>('quiz')
  const [pdfDifficulty, setPdfDifficulty]       = useState<'easy'|'medium'|'hard'>('medium')
  const [pdfNumQ, setPdfNumQ]                   = useState(5)
  const [pdfQTypes, setPdfQTypes]               = useState<('mcq'|'short'|'fill'|'long')[]>(['mcq','short'])
  const [topicMode, setTopicMode]               = useState<'all'|'single'|'multiple'>('all')
  const [pdfTopics, setPdfTopics]               = useState<string[]>([])
  const [selectedTopics, setSelectedTopics]     = useState<string[]>([])
  const [singleTopic, setSingleTopic]           = useState('')
  const [extractingTopics, setExtractingTopics] = useState(false)
  const [topicsOpen, setTopicsOpen]             = useState(false)
  const [pdfLoading, setPdfLoading]             = useState(false)
  const [pdfQuestions, setPdfQuestions]         = useState<Question[]>([])
  const [pdfTitle, setPdfTitle]                 = useState('')
  const [savingPdf, setSavingPdf]               = useState(false)
  const [pdfExpandedQ, setPdfExpandedQ]         = useState<number | null>(null)
  const topicsRef     = useRef<HTMLDivElement>(null)
  // Session-scoped cache: contentId → extracted topic list (avoids redundant API calls)
  const topicCacheRef = useRef<Map<string, string[]>>(new Map())

  // PDFs available: filter by selected student if chosen
  const availablePDFs = useMemo(() =>
    contentItems.filter(c => c.fileUrl && (!pdfStudentId || c.studentId === pdfStudentId || !c.studentId)),
    [contentItems, pdfStudentId])

  const selectedPDF = contentItems.find(c => c.id === pdfContentId)
  const pdfStudent  = students.find(s => s.id === pdfStudentId)

  // Auto-select student's subject when student changes
  useEffect(() => {
    if (pdfStudent?.subjects?.length) setPdfSubject(pdfStudent.subjects[0])
  }, [pdfStudentId])

  // Reset topics when PDF changes
  useEffect(() => {
    setPdfTopics([]); setSelectedTopics([]); setSingleTopic(''); setTopicMode('all')
  }, [pdfContentId])

  // Close topics dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (topicsRef.current && !topicsRef.current.contains(e.target as Node)) setTopicsOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const togglePdfQType = (t: 'mcq'|'short'|'fill'|'long') =>
    setPdfQTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])

  const toggleTopic = (t: string) =>
    setSelectedTopics(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])

  // Parse Gemini quota retry time from error message
  const parseRetrySeconds = (msg: string) => {
    const m = msg.match(/retry in (\d+(\.\d+)?)s/i)
    return m ? Math.ceil(parseFloat(m[1])) : null
  }

  const friendlyAIError = (e: any): string => {
    const msg: string = e?.message ?? String(e)
    const retry = parseRetrySeconds(msg)
    if (retry) return `Gemini rate limit hit — please wait ${retry} seconds and try again.`
    if (msg.includes('quota')) return 'Gemini API quota exceeded. Wait a minute and retry.'
    if (msg.includes('API_KEY') || msg.includes('api key')) return 'Invalid Gemini API key. Check VITE_GEMINI_API_KEY in Render.'
    return msg
  }

  const handleExtractTopics = async () => {
    if (!selectedPDF?.fileUrl) return

    // Serve from session cache — avoids burning quota re-reading the same PDF
    const cached = topicCacheRef.current.get(selectedPDF.id)
    if (cached) {
      setPdfTopics(cached); setSelectedTopics(cached); setSingleTopic(cached[0] ?? '')
      return
    }

    setExtractingTopics(true)
    setPdfTopics([]); setSelectedTopics([]); setSingleTopic('')
    try {
      const topics = await callWithRetry(
        () => extractTopicsFromURL(selectedPDF.fileUrl!),
        (s) => toast.loading(`Rate limited — retrying in ${s}s…`, { id: 'rl-ext' }),
      )
      toast.dismiss('rl-ext')
      topicCacheRef.current.set(selectedPDF.id, topics)
      setPdfTopics(topics)
      setSelectedTopics(topics)    // default: all selected
      setSingleTopic(topics[0] ?? '')
    } catch (e: any) {
      toast.dismiss('rl-ext')
      toast.error(friendlyAIError(e))
    } finally {
      setExtractingTopics(false)
    }
  }

  // Compute effective topics for generation
  const effectiveTopics = topicMode === 'all'
    ? []   // empty = whole PDF
    : topicMode === 'single'
      ? (singleTopic ? [singleTopic] : [])
      : selectedTopics

  const handleGenerateFromPDF = async () => {
    if (!selectedPDF?.fileUrl) { toast.error('Select a PDF from the Content Library first'); return }
    if (pdfQTypes.length === 0) { toast.error('Select at least one question type'); return }
    if (!import.meta.env.VITE_GEMINI_API_KEY) { toast.error('Add VITE_GEMINI_API_KEY first'); return }
    if (topicMode !== 'all' && effectiveTopics.length === 0) { toast.error('Select at least one chapter/topic'); return }
    setPdfLoading(true); setPdfQuestions([])
    try {
      const topicStr = effectiveTopics.length > 0 ? effectiveTopics.join(', ') : selectedPDF.title
      const params = {
        topic:         topicStr,
        subject:       pdfSubject,
        grade:         pdfStudent?.grade ?? (selectedPDF.grade !== 'All' ? selectedPDF.grade : '6'),
        board:         (pdfStudent?.board ?? (selectedPDF.board !== 'All' ? selectedPDF.board : 'CBSE')) as string,
        difficulty:    pdfDifficulty,
        numQuestions:  pdfNumQ,
        questionTypes: pdfQTypes,
        context:       effectiveTopics.length > 0 ? `Focus ONLY on these chapters/topics: ${effectiveTopics.join(', ')}` : '',
      }
      const questions = await callWithRetry(
        () => generateFromPDF(selectedPDF.fileUrl!, params),
        (s) => toast.loading(`Rate limited — retrying in ${s}s…`, { id: 'rl-gen' }),
      )
      toast.dismiss('rl-gen')
      setPdfQuestions(questions)
      const label = pdfContentType === 'worksheet' ? 'Worksheet' : pdfContentType === 'quiz' ? 'Quiz' : 'Exam Paper'
      const topicSuffix = effectiveTopics.length > 0 && effectiveTopics.length <= 2
        ? ` (${effectiveTopics.join(', ')})`
        : effectiveTopics.length > 2 ? ` (${effectiveTopics.length} topics)` : ''
      setPdfTitle(`${selectedPDF.title}${topicSuffix} — ${label}`)
      toast.success(`${questions.length} questions generated! ✅`)
    } catch (e: any) {
      toast.dismiss('rl-gen')
      toast.error(friendlyAIError(e))
    } finally {
      setPdfLoading(false)
    }
  }

  const handleSavePdfContent = async () => {
    if (!pdfTitle.trim() || pdfQuestions.length === 0) return
    setSavingPdf(true)
    try {
      const totalMarks = pdfQuestions.reduce((s, q) => s + q.marks, 0)
      await addContent({
        title:       pdfTitle,
        type:        pdfContentType,
        board:       (pdfStudent?.board ?? selectedPDF?.board ?? 'CBSE') as any,
        grade:       pdfStudent?.grade ?? selectedPDF?.grade ?? 'All',
        subject:     pdfSubject,
        description: `AI-generated from "${selectedPDF?.title}"${effectiveTopics.length ? ` — Topics: ${effectiveTopics.join(', ')}` : ''}`,
        body: '', questions: pdfQuestions, totalMarks,
        duration:    pdfContentType === 'test' ? 60 : 30,
        tags: ['ai-generated', 'from-pdf'], forLD: false,
        fileUrl: '', fileName: '', fileSize: 0,
        studentId:   pdfStudentId,
        studentName: pdfStudent?.name ?? '',
      })
      toast.success('Saved to Content Library! 🎉')
      setPdfQuestions([]); setPdfTitle(''); setPdfContentId('')
      setSelectedTopics([]); setPdfTopics([]); setSingleTopic('')
    } catch {
      toast.error('Failed to save')
    } finally {
      setSavingPdf(false)
    }
  }

  const updatePdfQuestion = (idx: number, data: Partial<Question>) =>
    setPdfQuestions(qs => qs.map((q, i) => i === idx ? { ...q, ...data } : q))

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
      const text = await callWithRetry(
        () => generateInsights(insightsData),
        (s) => toast.loading(`Rate limited — retrying in ${s}s…`, { id: 'rl-ins' }),
      )
      toast.dismiss('rl-ins')
      setInsights(text)
    } catch (e: any) {
      toast.dismiss('rl-ins')
      toast.error(friendlyAIError(e))
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
      const questions = await callWithRetry(
        () => generateQuiz(quizForm),
        (s) => toast.loading(`Rate limited — retrying in ${s}s…`, { id: 'rl-quiz' }),
      )
      toast.dismiss('rl-quiz')
      setGeneratedQuestions(questions)
      setQuizTitle(`${quizForm.topic} — ${quizForm.subject} Quiz`)
      toast.success(`${questions.length} questions generated!`)
    } catch (e: any) {
      toast.dismiss('rl-quiz')
      toast.error(friendlyAIError(e))
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
      <div className="flex gap-2 mb-6 flex-wrap">
        <button onClick={() => setActiveTab('insights')} className={`tab-btn flex items-center gap-2 ${activeTab === 'insights' ? 'active' : ''}`}>
          <Brain size={15} /> Student Insights
        </button>
        <button onClick={() => setActiveTab('quiz')} className={`tab-btn flex items-center gap-2 ${activeTab === 'quiz' ? 'active' : ''}`}>
          <Wand2 size={15} /> AI Quiz Generator
        </button>
        <button onClick={() => setActiveTab('pdf')} className={`tab-btn flex items-center gap-2 ${activeTab === 'pdf' ? 'active' : ''}`}>
          <FileText size={15} /> Generate from PDF
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

      {/* ── GENERATE FROM PDF TAB ────────────────────────── */}
      {activeTab === 'pdf' && (
        <div className="space-y-5">
          <div className="card p-5">
            <h3 className="font-semibold text-slate-900 mb-1 flex items-center gap-2">
              <FileText size={16} className="text-indigo-500" /> Generate from PDF
            </h3>
            <p className="text-xs text-slate-400 mb-5">Upload any study material PDF — AI reads it and creates a worksheet, quiz or exam paper instantly.</p>

            <div className="space-y-4">
              {/* Step 1: Student */}
              <div>
                <label className="label">Step 1 — Select Student <span className="text-slate-400 font-normal">(optional)</span></label>
                <select className="input" value={pdfStudentId} onChange={e => setPdfStudentId(e.target.value)}>
                  <option value="">General (no specific student)</option>
                  {students.filter(s => s.active).map(s => (
                    <option key={s.id} value={s.id}>{s.name} — Grade {s.grade} · {s.board}</option>
                  ))}
                </select>
                {pdfStudent && (
                  <p className="text-xs text-indigo-600 mt-1">
                    ✓ Grade {pdfStudent.grade} · {pdfStudent.board} will be used for question context
                  </p>
                )}
              </div>

              {/* Step 2: Subject */}
              <div>
                <label className="label">Step 2 — Subject</label>
                <select className="input" value={pdfSubject} onChange={e => setPdfSubject(e.target.value)}>
                  {SUBJECTS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>

              {/* Step 3: Content Type */}
              <div>
                <label className="label">Step 3 — Type of Content to Create</label>
                <div className="grid grid-cols-3 gap-2">
                  {([['worksheet','📝 Worksheet'],['quiz','🧠 Quiz'],['test','📋 Exam Paper']] as const).map(([val, label]) => (
                    <button key={val} type="button" onClick={() => setPdfContentType(val)}
                      className={`py-3 rounded-xl border text-sm font-medium transition-all ${pdfContentType === val ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}
                    >{label}</button>
                  ))}
                </div>
              </div>

              {/* Step 4: Select PDF from Content Library */}
              <div>
                <label className="label">Step 4 — Select PDF from Content Library</label>
                {availablePDFs.length === 0 ? (
                  <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center">
                    <p className="text-sm text-slate-400">No PDFs found.{pdfStudentId ? ' Try selecting a different student or' : ''} Go to <strong>Content → Student PDFs</strong> to add PDFs first.</p>
                  </div>
                ) : (
                  <select className="input" value={pdfContentId} onChange={e => { setPdfContentId(e.target.value); setPdfQuestions([]) }}>
                    <option value="">— Select a PDF —</option>
                    {availablePDFs.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.title}{c.studentName ? ` · ${c.studentName}` : ''}{c.grade !== 'All' ? ` · Grade ${c.grade}` : ''}
                      </option>
                    ))}
                  </select>
                )}
                {selectedPDF && (
                  <p className="text-xs text-green-600 mt-1">✓ {selectedPDF.fileName || selectedPDF.title}</p>
                )}
              </div>

              {/* Step 5: Chapter / Topic selection */}
              {pdfContentId && (
                <div className="space-y-3">
                  <label className="label">Step 5 — Chapter / Topic Selection</label>

                  {/* Mode selector */}
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      ['all',      '📖 All Chapters'],
                      ['single',   '📄 Single Chapter'],
                      ['multiple', '☑️ Multiple Chapters'],
                    ] as const).map(([val, lbl]) => (
                      <button key={val} type="button"
                        onClick={() => { setTopicMode(val); if (val !== 'all' && pdfTopics.length === 0) {} }}
                        className={`py-2 px-2 rounded-xl border text-xs font-medium transition-all ${topicMode === val ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}
                      >{lbl}</button>
                    ))}
                  </div>

                  {/* Extract button — only shown when single/multiple mode and no topics yet */}
                  {topicMode !== 'all' && pdfTopics.length === 0 && (
                    <button type="button" onClick={handleExtractTopics} disabled={extractingTopics}
                      className="btn-secondary w-full justify-center">
                      {extractingTopics
                        ? <><Loader2 size={14} className="animate-spin" /> Extracting chapters from PDF…</>
                        : <><Sparkles size={14} /> Extract Chapters / Topics from PDF</>}
                    </button>
                  )}

                  {/* SINGLE mode — radio list */}
                  {topicMode === 'single' && pdfTopics.length > 0 && (
                    <div ref={topicsRef} className="relative">
                      <button type="button" onClick={() => setTopicsOpen(o => !o)}
                        className="input w-full flex items-center justify-between text-left">
                        <span className="text-sm truncate">{singleTopic || 'Select a chapter…'}</span>
                        <ChevronsUpDown size={14} className="text-slate-400 flex-shrink-0 ml-2" />
                      </button>
                      {topicsOpen && (
                        <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                          {pdfTopics.map(t => (
                            <button key={t} type="button"
                              onClick={() => { setSingleTopic(t); setTopicsOpen(false) }}
                              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-indigo-50 text-left">
                              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${singleTopic === t ? 'border-indigo-600' : 'border-slate-300'}`}>
                                {singleTopic === t && <div className="w-2 h-2 rounded-full bg-indigo-600" />}
                              </div>
                              <span className="text-sm text-slate-700">{t}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* MULTIPLE mode — checkbox dropdown */}
                  {topicMode === 'multiple' && pdfTopics.length > 0 && (
                    <div ref={topicsRef} className="relative">
                      <button type="button" onClick={() => setTopicsOpen(o => !o)}
                        className="input w-full flex items-center justify-between text-left">
                        <span className="text-sm truncate">
                          {selectedTopics.length === 0 ? 'Select chapters…'
                            : selectedTopics.length === pdfTopics.length ? 'All chapters selected'
                            : selectedTopics.slice(0,2).join(', ') + (selectedTopics.length > 2 ? ` +${selectedTopics.length - 2} more` : '')}
                        </span>
                        <ChevronsUpDown size={14} className="text-slate-400 flex-shrink-0 ml-2" />
                      </button>
                      {topicsOpen && (
                        <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
                          <div className="flex gap-3 px-3 py-2 border-b border-slate-100 sticky top-0 bg-white">
                            <button type="button" onClick={() => setSelectedTopics([...pdfTopics])} className="text-xs text-indigo-600 font-medium">Select All</button>
                            <span className="text-slate-300">|</span>
                            <button type="button" onClick={() => setSelectedTopics([])} className="text-xs text-slate-500">Clear All</button>
                            <span className="ml-auto text-xs text-slate-400">{selectedTopics.length}/{pdfTopics.length}</span>
                          </div>
                          {pdfTopics.map(t => (
                            <button key={t} type="button" onClick={() => toggleTopic(t)}
                              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 text-left">
                              <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${selectedTopics.includes(t) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>
                                {selectedTopics.includes(t) && <Check size={10} className="text-white" />}
                              </div>
                              <span className="text-sm text-slate-700">{t}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {/* chips */}
                      {selectedTopics.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {selectedTopics.map(t => (
                            <span key={t} className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full">
                              {t}<button type="button" onClick={() => toggleTopic(t)} className="hover:text-red-500">×</button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Step 6: Difficulty + Questions */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Difficulty</label>
                  <div className="flex gap-2">
                    {(['easy','medium','hard'] as const).map(d => (
                      <button key={d} type="button" onClick={() => setPdfDifficulty(d)}
                        className={`flex-1 py-2 text-xs font-semibold rounded-lg border capitalize transition-all ${pdfDifficulty === d
                          ? d === 'easy' ? 'bg-green-600 border-green-600 text-white'
                            : d === 'medium' ? 'bg-amber-500 border-amber-500 text-white'
                            : 'bg-red-600 border-red-600 text-white'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                      >{d}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="label">Number of Questions</label>
                  <div className="flex gap-1.5">
                    {[5, 8, 10, 15].map(n => (
                      <button key={n} type="button" onClick={() => setPdfNumQ(n)}
                        className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all ${pdfNumQ === n ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-200 text-slate-600 hover:border-indigo-300'}`}
                      >{n}</button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="label">Question Types</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {Q_TYPES.map(({ id, label }) => (
                    <button key={id} type="button" onClick={() => togglePdfQType(id as any)}
                      className={`p-2.5 text-xs font-medium rounded-lg border transition-all text-left ${pdfQTypes.includes(id as any) ? 'bg-indigo-50 border-indigo-400 text-indigo-700' : 'border-slate-200 text-slate-600 hover:border-indigo-200'}`}
                    >
                      {pdfQTypes.includes(id as any) && '✓ '}{label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Generate button */}
              <button
                onClick={handleGenerateFromPDF}
                disabled={pdfLoading || !pdfContentId || !hasGeminiKey || pdfQTypes.length === 0 || extractingTopics}
                className="btn-primary w-full justify-center py-3"
              >
                {pdfLoading
                  ? <><Loader2 size={16} className="animate-spin" /> Reading PDF & Generating…</>
                  : <><Sparkles size={16} /> Generate {pdfContentType === 'worksheet' ? 'Worksheet' : pdfContentType === 'quiz' ? 'Quiz' : 'Exam Paper'}
                      {topicMode === 'single' && singleTopic ? ` — ${singleTopic}` : ''}
                      {topicMode === 'multiple' && selectedTopics.length > 0 ? ` (${selectedTopics.length} chapters)` : ''}
                    </>}
              </button>
            </div>
          </div>

          {/* Generated Questions Preview */}
          {pdfQuestions.length > 0 && (
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-900">
                  Generated Questions ({pdfQuestions.length})
                  <span className="ml-2 text-xs font-normal text-slate-400">
                    {pdfQuestions.reduce((s, q) => s + q.marks, 0)} marks total
                  </span>
                </h3>
                <span className="text-xs text-slate-400">Review & edit before saving</span>
              </div>

              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {pdfQuestions.map((q, i) => (
                  <div key={i} className="border border-slate-200 rounded-xl overflow-hidden">
                    <button
                      className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 text-left"
                      onClick={() => setPdfExpandedQ(pdfExpandedQ === i ? null : i)}
                    >
                      <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                      <span className="flex-1 text-sm font-medium text-slate-800 truncate">{q.text}</span>
                      <span className="text-xs text-slate-400 flex-shrink-0">{q.marks}m · {q.type}</span>
                      {pdfExpandedQ === i ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                    </button>
                    {pdfExpandedQ === i && (
                      <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-2">
                        <textarea className="input resize-none text-sm" rows={2} value={q.text}
                          onChange={e => updatePdfQuestion(i, { text: e.target.value })} />
                        {q.type === 'mcq' && (
                          <div className="grid grid-cols-2 gap-2">
                            {(q.options ?? []).map((o, oi) => (
                              <input key={oi} className="input text-xs" value={o}
                                onChange={e => {
                                  const opts = [...(q.options ?? [])]
                                  opts[oi] = e.target.value
                                  updatePdfQuestion(i, { options: opts })
                                }}
                                placeholder={`Option ${String.fromCharCode(65 + oi)}`} />
                            ))}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <label className="text-xs text-slate-400 mb-1 block">Answer / Key</label>
                            <input className="input text-xs" value={q.answer ?? ''}
                              onChange={e => updatePdfQuestion(i, { answer: e.target.value })} />
                          </div>
                          <div className="w-20">
                            <label className="text-xs text-slate-400 mb-1 block">Marks</label>
                            <input type="number" className="input text-xs" min={1} value={q.marks}
                              onChange={e => updatePdfQuestion(i, { marks: Number(e.target.value) })} />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
                <div>
                  <label className="label">Title</label>
                  <input className="input" value={pdfTitle} onChange={e => setPdfTitle(e.target.value)}
                    placeholder="e.g. Chapter 5 — Photosynthesis Quiz" />
                </div>
                <button onClick={handleSavePdfContent} disabled={savingPdf || !pdfTitle.trim()}
                  className="btn-primary w-full justify-center">
                  {savingPdf
                    ? <><Loader2 size={15} className="animate-spin" /> Saving…</>
                    : <><Save size={15} /> Save to Content Library</>}
                </button>
              </div>
            </div>
          )}
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
