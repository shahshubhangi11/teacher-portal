import { useState, useEffect } from 'react'
import {
  collection, query, orderBy, onSnapshot,
  addDoc, deleteDoc, doc, updateDoc, serverTimestamp,
} from 'firebase/firestore'
import { db, auth } from '../lib/firebase'
import type { Exam } from '../types'

export function useExams() {
  const [exams, setExams]     = useState<Exam[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const uid = auth.currentUser?.uid
    if (!uid) { setLoading(false); return }
    const q = query(
      collection(db, 'users', uid, 'exams'),
      orderBy('date', 'asc'),
    )
    return onSnapshot(q,
      (snap) => {
        setExams(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Exam)))
        setLoading(false)
      },
      (err) => { console.error('useExams:', err); setLoading(false) },
    )
  }, [])

  const addExam = async (data: Omit<Exam, 'id' | 'createdAt'>) => {
    const uid = auth.currentUser?.uid!
    await addDoc(collection(db, 'users', uid, 'exams'), {
      ...data, createdAt: serverTimestamp(),
    })
  }

  const updateExam = async (id: string, data: Partial<Exam>) => {
    const uid = auth.currentUser?.uid!
    await updateDoc(doc(db, 'users', uid, 'exams', id), data)
  }

  const deleteExam = async (id: string) => {
    const uid = auth.currentUser?.uid!
    await deleteDoc(doc(db, 'users', uid, 'exams', id))
  }

  return { exams, loading, addExam, updateExam, deleteExam }
}
