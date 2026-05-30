import Groq from 'groq-sdk'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { Question } from '../types'

// ── PDF.js worker ───────────────────────────────────────────────
// Served from the same origin (Vite bundles it as a static asset).
// This avoids cross-origin worker restrictions that silently break parsing.
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

// ── Groq client ─────────────────────────────────────────────────
// Free tier: 30 RPM · 14 400 RPD · model-dependent TPM
// Sign up at https://console.groq.com → API Keys
const MODEL = 'llama-3.3-70b-versatile'

function getClient() {
  const key = import.meta.env.VITE_GROQ_API_KEY
  if (!key) throw new Error('VITE_GROQ_API_KEY is not set — add it in Render Environment Variables')
  return new Groq({ apiKey: key, dangerouslyAllowBrowser: true })
}

// ── PDF text extraction with dual caching ──────────────────────
// Extract plain text once; cache in memory + localStorage for 24 h.
// ~5 K tokens for a typical chapter — well within free-tier limits.

const TEXT_TTL = 24 * 60 * 60 * 1_000
const textMemCache = new Map<string, { text: string; exp: number }>()

function textLsKey(url: string): string {
  let h = 0
  for (let i = 0; i < url.length; i++) h = (Math.imul(31, h) + url.charCodeAt(i)) | 0
  return `pxt_${Math.abs(h).toString(36)}`
}

export async function extractPDFTextFromURL(pdfUrl: string): Promise<string> {
  const now = Date.now()

  // Memory cache
  const m = textMemCache.get(pdfUrl)
  if (m && m.exp > now) return m.text

  // localStorage cache
  const lsKey = textLsKey(pdfUrl)
  try {
    const raw = localStorage.getItem(lsKey)
    if (raw) {
      const { text, exp } = JSON.parse(raw) as { text: string; exp: number }
      if (exp > now) { textMemCache.set(pdfUrl, { text, exp }); return text }
      localStorage.removeItem(lsKey)
    }
  } catch { /* ignore */ }

  // Fetch the file
  const res = await fetch(pdfUrl)
  if (!res.ok) throw new Error(`Could not download PDF (HTTP ${res.status}). Try re-uploading.`)

  // Reject HTML error pages served in place of the file
  const ct = res.headers.get('content-type') ?? ''
  if (ct.includes('text/html')) {
    throw new Error('The PDF URL returned an HTML page instead of a file. Please re-upload the PDF.')
  }

  const arrayBuffer = await res.arrayBuffer()

  // Validate PDF magic bytes — every valid PDF starts with "%PDF-"
  const header = String.fromCharCode(...new Uint8Array(arrayBuffer.slice(0, 5)))
  if (!header.startsWith('%PDF')) {
    throw new Error(
      'The file does not appear to be a valid PDF. ' +
      'Please re-upload the original PDF file.'
    )
  }

  // Parse with PDF.js
  let pdf: pdfjsLib.PDFDocumentProxy
  try {
    pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  } catch (e: any) {
    const name: string = e?.name ?? ''
    if (name === 'InvalidPDFException' || name === 'MissingPDFException') {
      throw new Error(
        'PDF structure is invalid or the file is corrupted. ' +
        'Try opening the PDF in Adobe Reader first, then re-upload.'
      )
    }
    if (name === 'PasswordException') {
      throw new Error('This PDF is password-protected. Remove the password before uploading.')
    }
    throw e
  }

  // Extract text from all pages (cap at 80 pages)
  const pageTexts: string[] = []
  for (let i = 1; i <= Math.min(pdf.numPages, 80); i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    pageTexts.push(
      (content.items as Array<{ str?: string }>).map(it => it.str ?? '').join(' ')
    )
  }

  const text = pageTexts.join('\n').trim()

  // Warn about image-only (scanned) PDFs but don't block — AI will generate
  // generic questions based on the topic name instead.
  if (!text) {
    throw new Error(
      'This PDF has no selectable text — it may be a scanned image. ' +
      'Use the AI Quiz Generator tab and type the topic manually instead.'
    )
  }

  const exp = now + TEXT_TTL
  textMemCache.set(pdfUrl, { text, exp })
  if (text.length < 400_000) {
    try { localStorage.setItem(lsKey, JSON.stringify({ text, exp })) } catch { /* quota */ }
  }
  return text
}

// ── Helper: call Groq chat completions ─────────────────────────
async function chat(prompt: string): Promise<string> {
  const completion = await getClient().chat.completions.create({
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 4096,
  })
  return completion.choices[0]?.message?.content ?? ''
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
  context?: string
}

export async function generateQuiz(params: QuizGenParams): Promise<Question[]> {
  const contextSection = params.context
    ? `\n\nSTUDY MATERIAL — base ALL questions strictly on the following:\n${params.context.slice(0, 20_000)}`
    : ''

  const prompt = `You are an expert Indian school teacher creating quiz questions for the "${params.board}" curriculum.

Create exactly ${params.numQuestions} quiz questions for:
- Topic: "${params.topic}"
- Subject: ${params.subject}
- Grade/Standard: ${params.grade}
- Difficulty: ${params.difficulty}
- Question types to include: ${params.questionTypes.join(', ')}
${contextSection}

Rules:
- Distribute questions evenly across the requested types.
- For "mcq": exactly 4 options; "answer" = full text of the correct option.
- For "short": "answer" = 1–2 sentence expected answer.
- For "fill": question must contain "_____"; "answer" = the missing word/phrase.
- For "long": "answer" = key points (3–5 bullet points).
- Marks: mcq=1, short=2, fill=1, long=4

Return ONLY a valid JSON array, no markdown, no explanation:
[{"id":"1","text":"...","type":"mcq","options":["A","B","C","D"],"answer":"A","marks":1}]`

  const raw = await chat(prompt)
  const jsonStr = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/, '').trim()
  const parsed: Question[] = JSON.parse(jsonStr)
  return parsed.map((q, i) => ({ ...q, id: String(i + 1) }))
}

// ── Extract topics / chapters from a PDF URL ───────────────────
export async function extractTopicsFromURL(pdfUrl: string): Promise<string[]> {
  const text = await extractPDFTextFromURL(pdfUrl)

  const raw = await chat(
    `Based on the following study material, list every distinct chapter, section, topic and sub-topic.\n` +
    `Return ONLY a valid JSON array of concise topic names (max 25 items), no markdown:\n` +
    `["Topic 1","Topic 2",...]\n\nSTUDY MATERIAL:\n${text.slice(0, 20_000)}`
  )
  const jsonStr = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/, '').trim()
  return JSON.parse(jsonStr) as string[]
}

// ── Generate from a local PDF File (File object) ───────────────
// Falls back to text extraction via pdfjs for local files too.
export async function generateFromPDFFile(
  file: File,
  params: QuizGenParams,
): Promise<Question[]> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const pages: string[] = []
  for (let i = 1; i <= Math.min(pdf.numPages, 80); i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    pages.push((content.items as Array<{ str?: string }>).map(it => it.str ?? '').join(' '))
  }
  const text = pages.join('\n').trim()
  return generateQuiz({ ...params, context: text })
}

// ── Generate from uploaded PDF URL ────────────────────────────
export async function generateFromPDF(
  pdfUrl: string,
  params: QuizGenParams,
): Promise<Question[]> {
  const text = await extractPDFTextFromURL(pdfUrl)
  return generateQuiz({
    ...params,
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
  const prompt = `You are an educational analytics assistant for a private tutor in India.
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

Return ONLY the insights, one per line. No headers, no numbering.`

  return chat(prompt)
}
