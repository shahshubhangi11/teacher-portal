import { useEffect, useState } from 'react'
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import { Student } from '../types'

export function useStudents() {
  const { user } = useAuth()
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'users', user.uid, 'students'), orderBy('name'))
    return onSnapshot(q,
      (snap) => {
        setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Student)))
        setLoading(false)
      },
      (err) => { console.error('useStudents:', err); setLoading(false) }
    )
  }, [user])

  const addStudent = async (data: Omit<Student, 'id' | 'createdAt'>) => {
    await addDoc(collection(db, 'users', user!.uid, 'students'), {
      ...data,
      createdAt: serverTimestamp(),
    })
  }

  const updateStudent = async (id: string, data: Partial<Student>) => {
    await updateDoc(doc(db, 'users', user!.uid, 'students', id), data as Record<string, unknown>)
  }

  const deleteStudent = async (id: string) => {
    await deleteDoc(doc(db, 'users', user!.uid, 'students', id))
  }

  return { students, loading, addStudent, updateStudent, deleteStudent }
}
