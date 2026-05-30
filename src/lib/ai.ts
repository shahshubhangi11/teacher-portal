import { GoogleGenerativeAI } from '@google/generative-ai'
import * as pdfjsLib from 'pdfjs-dist'
import { Question } from '../types'

// ── PDF.js worker ───────────────────────────────────────────────
// Load from unpkg CDN — exact version match, no bundling needed.
if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`
}

// ── Gemini client ───────────────────────────────────────────────
function getClient() {
  const key = import.meta.env.VITE_GEMINI_API_KEY
  if (!key) throw new Error('VITE_GEMINI_API_KEY is not set in .env')
  return new GoogleGenerativeAI(key)
}

// ── PDF text extraction with dual caching ──────────────────────
// Instead of sending the raw PDF binary (millions of tokens),
// we extract plain text (~30K tokens for a 100-page book).
// The extracted text is cached in memory + localStorage for 24 h.

const TEXT_TTL = 24 * 60 * 60 * 1_000   // 24 hours
const textMemCache = new Map<string, { text: string; exp: number }>()

function textLsKey(url: string): string {
  let h = 0
  for (let i = 0; i < url.length; i++) h = (Math.imul(31, h) + url.charCodeAt(i)) | 0
  return `pxt_${Math.abs(h).toString(36)}`
}

export async function extractPDFTextFromURL(pdfUrl: string): Promise<string> {
  const now = Date.now()

  // 1 — memory cache (same session)
  const m = textMemCache.get(pdfUrl)
  if (m && m.exp > now) return m.text

  // 2 — localStorage cache (survives page refresh, valid 24 h)
  const lsKey = textLsKey(pdfUrl)
  try {
    const raw = localStorage.getItem(lsKey)
    if (raw) {
      const { text, exp } = JSON.parse(raw) as { text: string; exp: number }
      if (exp > now) {
        textMemCache.set(pdfUrl, { text, exp })
        return text
      }
      localStorage.removeItem(lsKey)
    }
  } catch { /* storage unavailable */ }

  // 3 — fetch PDF and extract text with PDF.js
  const res = await fetch(pdfUrl)
  if (!res.ok) throw new Error('Could not fetch PDF')
  const arrayBuffer = await res.arrayBuffer()

  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const pageTexts: string[] = []

  for (let i = 1; i <= Math.min(pdf.numPages, 80); i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = (content.items as Array<{ str?: string }>)
      .map(item => item.str ?? '')
      .join(' ')
    pageTexts.push(pageText)
  }

  const text = pageTexts.join('\n').trim()
  const exp = now + TEXT_TTL

  textMemCache.set(pdfUrl, { text, exp })
  // Only persist to localStorage if size is manageable
  if (text.length < 400_000) {
    try { localStorage.setItem(lsKey, JSON.stringify({ text, exp })) } catch { /* quota full */ }
  }

  return text
}

// ── Quiz Generator ──────────────────────────────────────────────
export interface QuizGenParams {
  topic: string
  subject: string
  grade: string
  board: string
  difficulty: 'easy' | 'medium' | 'hard'
  numQuestions: number
  questionTypes: ('mcq' | 'short' | 'fill' | 'long')[]
  context?: string // chapter notes OR extracted PDF text (up to 80 K chars)
}

export async function generateQuiz(params: QuizGenParams): Promise<Question[]> {
  const model = getClient().getGenerativeModel({ model: 'gemini-2.0-flash' })

  const contextSection = params.context
    ? `\n\nSTUDY MATERIAL — base ALL questions strictly on the following content:\n${params.context.slice(0, 80_000)}`
    : ''

  const prompt = `
You are an expert Indian school teacher creating quiz questions for the "${params.board}" curriculum.

Create exactly ${params.numQuestions} quiz questions for:
- Topic: "${params.topic}"
- Subject: ${params.subject}
- Grade/Standard: ${params.grade}
- Difficulty: ${params.difficulty}
- Question types to include: ${params.questionTypes.join(', ')}
${contextSection}

Rules:
- Distribute the ${params.numQuestions} questions evenly across the requested types.
- For "mcq": provide exactly 4 options; "answer" = the full text of the correct option.
- For "short": "answer" = a concise expected answer (1–2 sentences).
- For "fill": question text must contain "_____"; "answer" = the missing word/phrase.
- For "long": "answer" = key points (bullet list, 3–5 points).
- Marks: mcq=1, short=2, fill=1, long=4

Return ONLY a valid JSON array — no markdown, no explanation, no extra text:
[
  {
    "id": "1",
    "text": "Question here",
    "type": "mcq",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "answer": "Option A",
    "marks": 1
  }
]
`.trim()

  const result = await model.generateContent(prompt)
  const raw = result.response.text().trim()
  const jsonStr = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/, '').trim()
  const parsed: Question[] = JSON.parse(jsonStr)
  return parsed.map((q, i) => ({ ...q, id: String(i + 1) }))
}

// ── Extract topics / chapters from a PDF URL ───────────────────
// Extracts text with PDF.js first, then asks Gemini for the topic list.
// Much lighter than sending the raw PDF binary inline.
export async function extractTopicsFromURL(pdfUrl: string): Promise<string[]> {
  const text = await extractPDFTextFromURL(pdfUrl)
  const model = getClient().getGenerativeModel({ model: 'gemini-2.0-flash' })

  const result = await model.generateContent(
    `Based on the following study material text, list every distinct chapter, section, topic ` +
    `and sub-topic. Return ONLY a valid JSON array of concise topic names (max 25 items), ` +
    `no markdown, no explanation:\n["Topic 1","Topic 2",...]\n\n` +
    `STUDY MATERIAL:\n${text.slice(0, 80_000)}`
  )
  const raw = result.response.text().trim()
  const jsonStr = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/, '').trim()
  return JSON.parse(jsonStr) as string[]
}

// ── Generate from a local PDF File (browser File object) ───────
// Uses inline base64 since there is no cached URL to key off of.
export async function generateFromPDFFile(
  file: File,
  params: QuizGenParams,
): Promise<Question[]> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

  const model = getClient().getGenerativeModel({ model: 'gemini-2.0-flash' })

  const prompt = `
You are an expert Indian school teacher. Read the attached PDF carefully.
Create exactly ${params.numQuestions} questions based on the PDF content for:
- Subject: ${params.subject}
- Grade/Standard: ${params.grade}
- Board: ${params.board}
- Difficulty: ${params.difficulty}
- Question types: ${params.questionTypes.join(', ')}

Rules:
- Base ALL questions strictly on the content of the PDF.
- Distribute questions evenly across the requested types.
- For "mcq": exactly 4 options; "answer" = full text of correct option.
- For "short": "answer" = 1–2 sentence expected answer.
- For "fill": question must contain "_____"; "answer" = missing word/phrase.
- For "long": "answer" = key points (3–5 bullet points).
- Marks: mcq=1, short=2, fill=1, long=4

Return ONLY a valid JSON array — no markdown, no explanation:
[{"id":"1","text":"...","type":"mcq","options":["A","B","C","D"],"answer":"A","marks":1}]
`.trim()

  const result = await model.generateContent([
    { inlineData: { mimeType: 'application/pdf', data: base64 } },
    { text: prompt },
  ])
  const raw = result.response.text().trim()
  const jsonStr = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/, '').trim()
  const parsed: Question[] = JSON.parse(jsonStr)
  return parsed.map((q, i) => ({ ...q, id: String(i + 1) }))
}

// ── Generate from uploaded PDF URL ────────────────────────────
// Extracts text with PDF.js (cached) then calls generateQuiz.
// Token cost: ~30 K instead of millions. No rate-limit pressure.
export async function generateFromPDF(
  pdfUrl: string,
  params: QuizGenParams,
): Promise<Question[]> {
  const text = await extractPDFTextFromURL(pdfUrl)
  return generateQuiz({
    ...params,
    // Merge with any explicit context already in params (e.g. chapter focus)
    context: params.context
      ? `${params.context}\n\nFULL STUDY MATERIAL:\n${text}`
      : text,
  })
}

// ── Student Insights ────────────────────────────────────────────
export interface InsightsData {
  totalStudents: number
  activeStudents: number
  boards: Record<string, number>
  sessionsThisMonth: number
  sessionsBySubject: Record<string, number>
  avgSessionsPerStudent: number
  pendingAmount: number
  paidAmount: number
  studentsWithLD: number
  recentNoteTopics: string[]
  lowAttendanceStudents: string[]
  topStudents: string[]
}

export async function generateInsights(data: InsightsData): Promise<string> {
  const model = getClient().getGenerativeModel({ model: 'gemini-2.0-flash' })

  const prompt = `
You are an educational analytics assistant for a private tutor in India.
Analyse the teaching data below and return 6–8 short, actionable insights.

Data:
${JSON.stringify(data, null, 2)}

Guidelines:
- Start each insight with a relevant emoji.
- Keep each line to 1–2 sentences max.
- Be specific and practical — avoid generic advice.
- Mention student names when relevant.
- Include at least one billing / business insight.
- Include at least one curriculum / learning insight.

Return ONLY the insights, one per line. No headers, no numbering.
`.trim()

  const result = await model.generateContent(prompt)
  return result.response.text().trim()
}
