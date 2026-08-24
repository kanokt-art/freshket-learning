'use client'

import { useState, useEffect, useMemo } from 'react'
import { getDemoMode } from '@/lib/demo/demoMode'
import { demoStore } from '@/lib/demo/demoStore'
import type { AppNotification } from '@/types/notification'
import { useFirestoreList } from '@/hooks/useFirestore'

const DEMO_MODE = getDemoMode()

export function useNotifications(uid: string | undefined) {
  const [demoItems, setDemoItems] = useState<AppNotification[]>([])

  useEffect(() => {
    if (!DEMO_MODE || !uid) { setDemoItems([]); return }
    const refresh = () => setDemoItems(demoStore.getNotifications(uid))
    refresh()
    return demoStore.subscribe(refresh)
  }, [uid])

  // Live reads go through the shared warm-listener registry: navigating between
  // pages no longer tears down / re-creates this subscription per mount.
  const fb = useFirestoreList<Record<string, unknown>>(
    uid ? `notifications/${uid}/items` : 'notifications/_none/items',
    [
      { type: 'orderBy', field: 'createdAt', direction: 'desc' },
      // Cap the feed — an unbounded subscription re-reads a user's entire
      // notification history forever; nobody scrolls past the recent hundred.
      { type: 'limit', count: 100 },
    ],
    !DEMO_MODE && !!uid,
  )

  const liveItems = useMemo<AppNotification[]>(
    () => fb.data.map(d => ({
      id: d.id as string,
      type: d.type,
      title: d.title,
      body: d.body,
      read: (d.read as boolean) ?? false,
      createdAt: (d.createdAt as Date) ?? new Date(0),
      refId: (d.refId as string) ?? '',
      refPath: (d.refPath as string) ?? '/',
    } as AppNotification)),
    [fb.data],
  )

  const items = DEMO_MODE ? demoItems : liveItems

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
