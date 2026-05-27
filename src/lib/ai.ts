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
