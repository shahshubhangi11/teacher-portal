import { GoogleGenerativeAI } from '@google/generative-ai'
import { Question } from '../types'

function getClient() {
  const key = import.meta.env.VITE_GEMINI_API_KEY
  if (!key) throw new Error('VITE_GEMINI_API_KEY is not set in .env')
  return new GoogleGenerativeAI(key)
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

// ── Generate from uploaded PDF ─────────────────────────────────
export async function generateFromPDF(
  pdfUrl: string,
  params: QuizGenParams,
): Promise<Question[]> {
  const model = getClient().getGenerativeModel({ model: 'gemini-2.0-flash' })

  // Fetch the PDF and convert to base64 so Gemini can read it inline
  const res = await fetch(pdfUrl)
  if (!res.ok) throw new Error('Could not fetch the PDF. Make sure it is publicly accessible.')
  const buf = await res.arrayBuffer()
  const bytes = new Uint8Array(buf)
  // Build base64 in chunks to avoid call-stack overflow on large files
  let binary = ''
  const chunk = 8192
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + chunk)))
  }
  const base64 = btoa(binary)

  const prompt = `
You are an expert Indian school teacher. Read the attached PDF study material carefully.
Create exactly ${params.numQuestions} questions based on the content of this PDF for:
- Subject: ${params.subject}
- Grade/Standard: ${params.grade}
- Board: ${params.board}
- Difficulty: ${params.difficulty}
- Question types: ${params.questionTypes.join(', ')}

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

  const result = await model.generateContent([
    { inlineData: { mimeType: 'application/pdf', data: base64 } },
    { text: prompt },
  ])
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
