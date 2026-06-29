'use client'

import { useState, useEffect } from 'react'
import { getDemoMode } from '@/lib/demo/demoMode'
import { demoStore } from '@/lib/demo/demoStore'
import type { AppNotification } from '@/types/notification'

const DEMO_MODE = getDemoMode()

export function useNotifications(uid: string | undefined) {
  const [items, setItems] = useState<AppNotification[]>([])

  useEffect(() => {
    if (!uid) { setItems([]); return }

    if (DEMO_MODE) {
      const refresh = () => setItems(demoStore.getNotifications(uid))
      refresh()
      return demoStore.subscribe(refresh)
    }

    // Firestore real-time listener
    let unsub: (() => void) | undefined
    ;(async () => {
      const { getClientFirestore } = await import('@/lib/firebase/client')
      const { collection, query, orderBy, onSnapshot } = await import('firebase/firestore')
      const db = getClientFirestore()
      const q = query(collection(db, 'notifications', uid, 'items'), orderBy('createdAt', 'desc'))
      unsub = onSnapshot(q, snap => {
        setItems(snap.docs.map(d => {
          const data = d.data()
          return {
            id: d.id,
            type: data.type,
            title: data.title,
            body: data.body,
            read: data.read ?? false,
            createdAt: data.createdAt?.toDate?.() ?? new Date(),
            refId: data.refId ?? '',
            refPath: data.refPath ?? '/',
          } as AppNotification
        }))
      })
    })()
    return () => unsub?.()
  }, [uid])

  const unreadCount = items.filter(n => !n.read).length

  function markRead(id: string) {
    if (DEMO_MODE) {
      if (uid) demoStore.markNotificationRead(uid, id)
      return
    }
    ;(async () => {
      const { getClientFirestore } = await import('@/lib/firebase/client')
      const { doc, updateDoc } = await import('firebase/firestore')
      if (!uid) return
      const db = getClientFirestore()
      await updateDoc(doc(db, 'notifications', uid, 'items', id), { read: true })
    })()
  }

  function markAllRead() {
    if (DEMO_MODE) {
      if (uid) demoStore.markAllNotificationsRead(uid)
      return
    }
    ;(async () => {
      const { getClientFirestore } = await import('@/lib/firebase/client')
      const { doc, writeBatch } = await import('firebase/firestore')
      if (!uid) return
      const db = getClientFirestore()
      const batch = writeBatch(db)
      items.filter(n => !n.read).forEach(n => {
        batch.update(doc(db, 'notifications', uid, 'items', n.id), { read: true })
      })
      await batch.commit()
    })()
  }

  return { items, unreadCount, markRead, markAllRead }
}
