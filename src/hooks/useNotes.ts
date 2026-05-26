import { useEffect, useState } from 'react'
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import { Note } from '../types'

export function useNotes() {
  const { user } = useAuth()
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'users', user.uid, 'notes'), orderBy('date', 'desc'))
    return onSnapshot(q,
      (snap) => {
        setNotes(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Note)))
        setLoading(false)
      },
      (err) => { console.error('useNotes:', err); setLoading(false) }
    )
  }, [user])

  const addNote = async (data: Omit<Note, 'id' | 'createdAt'>) => {
    await addDoc(collection(db, 'users', user!.uid, 'notes'), {
      ...data,
      createdAt: serverTimestamp(),
    })
  }

  const updateNote = async (id: string, data: Partial<Note>) => {
    await updateDoc(doc(db, 'users', user!.uid, 'notes', id), data as Record<string, unknown>)
  }

  const deleteNote = async (id: string) => {
    await deleteDoc(doc(db, 'users', user!.uid, 'notes', id))
  }

  const getNotesByDate = (date: string) => notes.filter((n) => n.date === date)
  const getNotesByStudent = (studentId: string) => notes.filter((n) => n.studentId === studentId)

  return { notes, loading, addNote, updateNote, deleteNote, getNotesByDate, getNotesByStudent }
}
