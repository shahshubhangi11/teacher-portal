import { useEffect, useState } from 'react'
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import { Content, ContentType } from '../types'

export function useContent() {
  const { user } = useAuth()
  const [items, setItems] = useState<Content[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'users', user.uid, 'content'), orderBy('createdAt', 'desc'))
    return onSnapshot(q,
      (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Content)))
        setLoading(false)
      },
      (err) => { console.error('useContent:', err); setLoading(false) }
    )
  }, [user])

  const addContent = async (data: Omit<Content, 'id' | 'createdAt'>) => {
    await addDoc(collection(db, 'users', user!.uid, 'content'), {
      ...data,
      createdAt: serverTimestamp(),
    })
  }

  const updateContent = async (id: string, data: Partial<Content>) => {
    await updateDoc(doc(db, 'users', user!.uid, 'content', id), data as Record<string, unknown>)
  }

  const deleteContent = async (id: string) => {
    await deleteDoc(doc(db, 'users', user!.uid, 'content', id))
  }

  const getByType = (type: ContentType | ContentType[]) => {
    const types = Array.isArray(type) ? type : [type]
    return items.filter((i) => types.includes(i.type))
  }

  return { items, loading, addContent, updateContent, deleteContent, getByType }
}
