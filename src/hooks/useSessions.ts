import { useEffect, useState } from 'react'
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp, where,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import { Session } from '../types'

export function useSessions() {
  const { user } = useAuth()
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'users', user.uid, 'sessions'), orderBy('date', 'desc'))
    return onSnapshot(q,
      (snap) => {
        setSessions(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Session)))
        setLoading(false)
      },
      (err) => { console.error('useSessions:', err); setLoading(false) }
    )
  }, [user])

  const addSession = async (data: Omit<Session, 'id' | 'createdAt'>) => {
    await addDoc(collection(db, 'users', user!.uid, 'sessions'), {
      ...data,
      createdAt: serverTimestamp(),
    })
  }

  const updateSession = async (id: string, data: Partial<Session>) => {
    await updateDoc(doc(db, 'users', user!.uid, 'sessions', id), data as Record<string, unknown>)
  }

  const deleteSession = async (id: string) => {
    await deleteDoc(doc(db, 'users', user!.uid, 'sessions', id))
  }

  const getSessionsByStudent = (studentId: string) =>
    sessions.filter((s) => s.studentId === studentId)

  const getSessionsByDate = (date: string) =>
    sessions.filter((s) => s.date === date)

  const getUnbilledSessions = (studentId: string) =>
    sessions.filter((s) => s.studentId === studentId && !s.billed && s.status === 'completed')

  return { sessions, loading, addSession, updateSession, deleteSession, getSessionsByStudent, getSessionsByDate, getUnbilledSessions }
}
