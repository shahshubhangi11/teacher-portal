import { useEffect, useState } from 'react'
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import { BillingRecord } from '../types'
import { format } from 'date-fns'

let invoiceCounter = 1000

export function useBilling() {
  const { user } = useAuth()
  const [records, setRecords] = useState<BillingRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'users', user.uid, 'billing'), orderBy('createdAt', 'desc'))
    return onSnapshot(q,
     (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as BillingRecord))
      setRecords(data)
      if (data.length > 0) {
        const maxNum = Math.max(
          ...data.map((r) => parseInt(r.invoiceNumber.replace(/\D/g, '')) || 1000)
        )
        invoiceCounter = maxNum + 1
      }
      setLoading(false)
     },
     (err) => { console.error('useBilling:', err); setLoading(false) }
    )
  }, [user])

  const generateInvoiceNumber = () => {
    return `INV-${format(new Date(), 'yyyyMM')}-${String(invoiceCounter++).padStart(4, '0')}`
  }

  const addRecord = async (data: Omit<BillingRecord, 'id' | 'createdAt' | 'invoiceNumber'>) => {
    await addDoc(collection(db, 'users', user!.uid, 'billing'), {
      ...data,
      invoiceNumber: generateInvoiceNumber(),
      createdAt: serverTimestamp(),
    })
  }

  const updateRecord = async (id: string, data: Partial<BillingRecord>) => {
    await updateDoc(doc(db, 'users', user!.uid, 'billing', id), data as Record<string, unknown>)
  }

  const deleteRecord = async (id: string) => {
    await deleteDoc(doc(db, 'users', user!.uid, 'billing', id))
  }

  const markPaid = async (id: string) => {
    await updateRecord(id, { paid: true, paidDate: format(new Date(), 'yyyy-MM-dd') })
  }

  const totalEarned = records.filter((r) => r.paid).reduce((s, r) => s + r.amount, 0)
  const totalPending = records.filter((r) => !r.paid).reduce((s, r) => s + r.amount, 0)

  return { records, loading, addRecord, updateRecord, deleteRecord, markPaid, totalEarned, totalPending }
}
