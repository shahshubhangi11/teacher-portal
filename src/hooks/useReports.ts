import { useEffect, useState } from 'react'
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import { Report } from '../types'

export function useReports() {
  const { user } = useAuth()
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'users', user.uid, 'reports'), orderBy('createdAt', 'desc'))
    return onSnapshot(q,
      (snap) => {
        setReports(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Report)))
        setLoading(false)
      },
      (err) => { console.error('useReports:', err); setLoading(false) }
    )
  }, [user])

  const addReport = async (data: Omit<Report, 'id' | 'createdAt'>) => {
    await addDoc(collection(db, 'users', user!.uid, 'reports'), {
      ...data,
      createdAt: serverTimestamp(),
    })
  }

  const updateReport = async (id: string, data: Partial<Report>) => {
    await updateDoc(doc(db, 'users', user!.uid, 'reports', id), data as Record<string, unknown>)
  }

  const deleteReport = async (id: string) => {
    await deleteDoc(doc(db, 'users', user!.uid, 'reports', id))
  }

  return { reports, loading, addReport, updateReport, deleteReport }
}
