import { GoogleGenerativeAI } from '@google/generative-ai'
import { Question } from '../types'

function getClient() {
  const key = import.meta.env.VITE_GEMINI_API_KEY
  if (!key) throw new Error('VITE_GEMINI_API_KEY is not set in .env')
  return new GoogleGenerativeAI(key)
}

// ── Gemini Files API — upload once, reuse for 47 h ─────────────
// Sending a PDF as base64 inline data on every request burns tokens fast.
// Instead we upload to the Files API once and reference it by URI.
// Google caches files for 48 h; we cache the URI for 47 h.

const FILE_TTL_MS = 47 * 60 * 60 * 1_000
const memFileCache = new Map<string, { uri: string; exp: number }>()

function filesCacheKey(url: string): string {
  // Short, stable localStorage key derived from the URL
  let h = 0
  for (let i = 0; i < url.length; i++) h = (Math.imul(31, h) + url.charCodeAt(i)) | 0
  return `gf_${Math.abs(h).toString(36)}`
}

/**
 * Returns a Gemini Files API URI for the given PDF URL.
 * On the first call it uploads the file; subsequent calls return the cached URI.
 * Returns null on any error so callers can fall back to inline base64.
 */
async function getOrUploadGeminiFile(pdfUrl: string, apiKey: string): Promise<string | null> {
  const now = Date.now()

  // 1 — in-memory cache (same page session)
  const m = memFileCache.get(pdfUrl)
  if (m && m.exp > now) return m.uri

  // 2 — localStorage cache (survives refresh, valid across sessions within 47 h)
  const lsKey = filesCacheKey(pdfUrl)
  try {
    const raw = localStorage.getItem(lsKey)
    if (raw) {
      const { uri, exp } = JSON.parse(raw) as { uri: string; exp: number }
      if (exp > now) {
        memFileCache.set(pdfUrl, { uri, exp })
        return uri
      }
      localStorage.removeItem(lsKey)
    }
  } catch { /* storage unavailable — continue */ }

  // 3 — fetch PDF and upload to the Gemini Files API (multipart)
  try {
    const fetchRes = await fetch(pdfUrl)
    if (!fetchRes.ok) return null
    const pdfBytes = new Uint8Array(await fetchRes.arrayBuffer())

    const boundary = 'b' + Math.random().toString(36).slice(2)
    const metaJson = JSON.stringify({ file: { displayName: 'document.pdf' } })
    const enc = new TextEncoder()
    const head = enc.encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaJson}\r\n` +
      `--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`
    )
    const tail = enc.encode(`\r\n--${boundary}--`)

    const body = new Uint8Array(head.length + pdfBytes.length + tail.length)
    body.set(head, 0)
    body.set(pdfBytes, head.length)
    body.set(tail, head.length + pdfBytes.length)

    const upRes = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=multipart&key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: body.buffer,
      }
    )
    if (!upRes.ok) return null   // fall back to inline base64

    const { file } = await upRes.json() as { file: { uri: string } }
    const uri = file.uri
    const exp = now + FILE_TTL_MS

    memFileCache.set(pdfUrl, { uri, exp })
    try { localStorage.setItem(lsKey, JSON.stringify({ uri, exp })) } catch { /* ignore */ }

    return uri
  } catch {
    return null  // network or CORS error — caller will use base64 fallback
  }
}

/**
 * Builds the PDF content part to pass to model.generateContent().
 * Prefers Files API URI; falls back to base64 inline data.
 */
async function buildPdfPart(pdfUrl: string, apiKey: string) {
  const fileUri = await getOrUploadGeminiFile(pdfUrl, apiKey)
  if (fileUri) {
    return { fileData: { mimeType: 'application/pdf', fileUri } } as const
  }

  // Fallback: fetch + base64 encode
  const res = await fetch(pdfUrl)
  if (!res.ok) throw new Error('Could not fetch PDF. Make sure it is publicly accessible.')
  const bytes = new Uint8Array(await res.arrayBuffer())
  let binary = ''
  const chunk = 8192
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + chunk)))
  }
  return { inlineData: { mimeType: 'application/pdf', data: btoa(binary) } } as const
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
  context?: string // optional extra instructions / chapter text
}

export async function generateQuiz(params: QuizGenParams): Promise<Question[]> {
  const model = getClient().getGenerativeModel({ model: 'gemini-2.0-flash' })

  const prompt = `
You are an expert Indian school teacher creating quiz questions for the "${params.board}" curriculum.

Create exactly ${params.numQuestions} quiz questions for:
- Topic: "${params.topic}"
- Subject: ${params.subject}
- Grade/Standard: ${params.grade}
- Difficulty: ${params.difficulty}
- Question types to include: ${params.questionTypes.join(', ')}
${params.context ? `- Extra context / chapter notes:\n${params.context.slice(0, 2000)}` : ''}

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

  // Strip markdown fences if present
  const jsonStr = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/, '').trim()
  const parsed: Question[] = JSON.parse(jsonStr)
  return parsed.map((q, i) => ({ ...q, id: String(i + 1) }))
}

// ── Extract topics / chapters from a PDF URL ───────────────────
export async function extractTopicsFromURL(pdfUrl: string): Promise<string[]> {
  const key = import.meta.env.VITE_GEMINI_API_KEY
  if (!key) throw new Error('VITE_GEMINI_API_KEY is not set in .env')
  const model = getClient().getGenerativeModel({ model: 'gemini-2.0-flash' })

  const pdfPart = await buildPdfPart(pdfUrl, key)

  const result = await model.generateContent([
    pdfPart,
    { text: 'List every distinct chapter, section, topic and sub-topic found in this PDF. Return ONLY a valid JSON array of concise topic names (max 25 items), no markdown, no explanation:\n["Topic 1","Topic 2",...]' },
  ])
  const raw = result.response.text().trim()
  const jsonStr = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/, '').trim()
  return JSON.parse(jsonStr) as string[]
}

// ── Generate from a local PDF File (browser FileReader, no upload) ─
export async function generateFromPDFFile(
  file: File,
  params: QuizGenParams,
): Promise<Question[]> {
  // Read the file as base64 using the browser FileReader API
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
export async function generateFromPDF(
  pdfUrl: string,
  params: QuizGenParams,
): Promise<Question[]> {
  const key = import.meta.env.VITE_GEMINI_API_KEY
  if (!key) throw new Error('VITE_GEMINI_API_KEY is not set in .env')
  const model = getClient().getGenerativeModel({ model: 'gemini-2.0-flash' })

  // Use Files API URI (cached) or fall back to inline base64
  const pdfPart = await buildPdfPart(pdfUrl, key)

  const prompt = `
You are an expert Indian school teacher. Read the attached PDF study material carefully.
Create exactly ${params.numQuestions} questions based on the content of this PDF for:
- Subject: ${params.subject}
- Grade/Standard: ${params.grade}
- Board: ${params.board}
- Difficulty: ${params.difficulty}
- Question types: ${params.questionTypes.join(', ')}
${params.context ? `- Focus: ${params.context}` : ''}

Rules:
- Base ALL questions strictly on the content of the PDF — no outside knowledge.
- Distribute questions evenly across the requested types.
- For "mcq": exactly 4 options; "answer" = full text of correct option.
- For "short": "answer" = 1–2 sentence expected answer.
- For "fill": question must contain "_____"; "answer" = missing word/phrase.
- For "long": "answer" = key points (3–5 bullet points).
- Marks: mcq=1, short=2, fill=1, long=4

Return ONLY a valid JSON array — no markdown, no explanation:
[{"id":"1","text":"...","type":"mcq","options":["A","B","C","D"],"answer":"A","marks":1}]
`.trim()

  const result = await model.generateContent([pdfPart, { text: prompt }])
  const raw = result.response.text().trim()
  const jsonStr = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/, '').trim()
  const parsed: Question[] = JSON.parse(jsonStr)
  return parsed.map((q, i) => ({ ...q, id: String(i + 1) }))
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
  lowAttendanceStudents: string[]   // names
  topStudents: string[]             // names (most sessions)
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
