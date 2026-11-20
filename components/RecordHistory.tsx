'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { isMissingRelation } from '@/lib/security'
import { formatDate } from '@/lib/format'

interface HistoryEvent {
  id: string
  event_type: string
  reason: string | null
  created_at: string
  actor_name: string | null
  before_data: Record<string, unknown>
  after_data: Record<string, unknown>
}

const LABELS: Record<string, string> = {
  created: 'Created',
  updated: 'Updated',
  deleted: 'Deleted',
  reversed: 'Reversed',
  moved: 'Moved',
  credit_memo: 'Credit memo',
}

export function RecordHistory({
  entityType,
  entityId,
}: {
  entityType: 'cost' | 'customer_invoice'
  entityId: string | null | undefined
}) {
  const [events, setEvents] = useState<HistoryEvent[]>([])
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    if (!entityId) return
    let active = true
    void (async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('record_events')
        .select('id, event_type, reason, created_at, before_data, after_data, actor:users(name)')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .order('created_at', { ascending: true })
      if (!active) return
      if (error) {
        if (isMissingRelation(error)) setHidden(true)
        return
      }
      setEvents(((data || []) as Array<HistoryEvent & { actor?: { name?: string } | { name?: string }[] | null }>).map((row) => {
        const actor = Array.isArray(row.actor) ? row.actor[0] : row.actor
        return { ...row, actor_name: actor?.name || null }
      }))
    })()
    return () => {
      active = false
    }
  }, [entityId, entityType])

  if (!entityId || hidden || events.length === 0) return null

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">History</p>
      <ol className="space-y-2">
        {events.map((event) => (
          <li key={event.id} className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
            <p className="text-foreground">
              {LABELS[event.event_type] || event.event_type}
              {event.actor_name ? ` · ${event.actor_name}` : ''}
              {' · '}
              {formatDate(event.created_at)}
            </p>
            {event.reason ? <p className="text-muted-foreground">{event.reason}</p> : null}
            {event.event_type === 'moved' ? (
              <p className="text-muted-foreground">
                {String(event.before_data?.category_name || 'Previous category')} → {String(event.after_data?.category_name || 'New category')}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  )
}
