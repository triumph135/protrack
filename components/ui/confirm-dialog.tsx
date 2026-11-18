'use client'

import { useEffect, useState } from 'react'
import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { Button } from '@/components/ui/button'

interface ConfirmRequest {
  title: string
  description: string
  confirmLabel?: string
  destructive?: boolean
  resolve: (value: boolean) => void
}

let openConfirm: (request: ConfirmRequest) => void = () => {}

export function confirmAction(options: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    openConfirm({ ...options, resolve })
  })
}

export function ConfirmDialogHost() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null)

  useEffect(() => {
    openConfirm = (next) => setRequest(next)
  }, [])

  const close = (value: boolean) => {
    request?.resolve(value)
    setRequest(null)
  }

  return (
    <AlertDialog.Root open={!!request} onOpenChange={(open) => !open && close(false)}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-zinc-950/40" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(100%-2rem,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-5 outline-none">
          <AlertDialog.Title className="text-base font-semibold">{request?.title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
            {request?.description}
          </AlertDialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="outline" type="button" onClick={() => close(false)}>
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button
                type="button"
                variant={request?.destructive ? 'destructive' : 'primary'}
                onClick={() => close(true)}
              >
                {request?.confirmLabel || 'Confirm'}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
