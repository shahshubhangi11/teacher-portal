import { Timestamp } from 'firebase/firestore'

export type Board = 'CBSE' | 'ICSE' | 'State' | 'Other'
export type BillingType = 'hourly' | 'monthly'
export type SessionStatus = 'scheduled' | 'completed' | 'cancelled'
export type ContentType =
  | 'grammar-worksheet'
  | 'maths-practice'
  | 'worksheet'
  | 'study-material'
  | 'quiz'
  | 'test'
  | 'writing-skills'
  | 'ld-material'

export const BOARDS: Board[] = ['CBSE', 'ICSE', 'State', 'Other']
export const GRADES = [
  'Pre-KG', 'KG',
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12',
  'CA Foundation', 'CS Foundation', 'Entrance Exam', 'Others',
]
// All values that are NOT the free-text placeholder
export const STANDARD_GRADES = GRADES.filter((g) => g !== 'Others')
export const SUBJECTS = ['English', 'Mathematics', 'Science', 'Hindi', 'Social Studies', 'EVS', 'Computer', 'Other']
export const EXAM_TYPES = ['Unit Test', 'Half Yearly', 'Final Exam', 'Board Exam', 'Practical', 'Oral', 'Project', 'Other']

export interface Exam {
  id: string
  studentId: string
  studentName: string
  grade: string
  board: Board
  subject: string
  examType: string       // Unit Test, Half Yearly, Board Exam, etc.
  date: string           // YYYY-MM-DD
  time?: string          // HH:MM (optional)
  syllabus?: string      // topics to cover
  venue?: string         // school / centre name
  notes?: string
  createdAt: Timestamp
}

export interface Student {
  id: string
  name: string
  grade: string
  board: Board
  subjects: string[]
  billingType: BillingType
  hourlyRate?: number
  monthlyFee?: number
  parentName: string
  phone: string
  email?: string
  hasLD: boolean
  notes?: string
  active: boolean
  createdAt: Timestamp
}

export interface Session {
  id: string
  studentId: string
  studentName: string
  subject: string
  date: string      // YYYY-MM-DD
  startTime: string // HH:MM
  endTime: string   // HH:MM
  durationMinutes: number
  status: SessionStatus
  notes?: string
  amount: number
  billed: boolean
  createdAt: Timestamp
}

export interface BillingRecord {
  id: string
  studentId: string
  studentName: string
  billingType: BillingType
  month?: string      // YYYY-MM for monthly
  sessionIds?: string[]
  totalSessions?: number
  totalHours?: number
  amount: number
  paid: boolean
  paidDate?: string
  invoiceNumber: string
  createdAt: Timestamp
}

export interface Note {
  id: string
  studentId: string
  studentName: string
  date: string // YYYY-MM-DD
  subject?: string
  content: string
  tags: string[]
  createdAt: Timestamp
}

export interface Question {
  id: string
  text: string
  type: 'mcq' | 'short' | 'long' | 'fill'
  options?: string[]
  answer?: string
  marks: number
}

export interface Content {
  id: string
  title: string
  type: ContentType
  board: Board | 'All'
  grade: string
  subject: string
  description?: string
  body?: string
  questions?: Question[]
  totalMarks?: number
  duration?: number // minutes, for tests
  tags: string[]
  forLD: boolean
  fileUrl?: string      // uploaded PDF download URL
  fileName?: string     // original file name
  fileSize?: number     // bytes
  studentId?: string    // optional: PDF for a specific student
  studentName?: string
  createdAt: Timestamp
}

export interface SubjectReport {
  subject: string
  grade: string // A+, A, B+, B, C, D
  remarks: string
}

export interface Report {
  id: string
  studentId: string
  studentName: string
  studentGrade: string
  board: Board
  period: string
  subjects: SubjectReport[]
  totalSessions: number
  attendancePercent: number
  strengths: string
  areasToImprove: string
  teacherRemarks: string
  createdAt: Timestamp
}
