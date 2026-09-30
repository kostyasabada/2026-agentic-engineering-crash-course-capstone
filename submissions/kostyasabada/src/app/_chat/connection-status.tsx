'use client'

import type { ConnectionStatus as Status } from './use-chat-socket'

/**
 * The connection status as its exact label (`Connected`, `Reconnecting`, `Disconnected`;
 * chat-room spec, design D2). `role="status"` is a polite live region, so assistive
 * technology announces a change without interrupting; `aria-live` is repeated explicitly.
 */
export function ConnectionStatus({ status }: { status: Status }) {
  return (
    <p role="status" aria-live="polite" className="connection-status" data-status={status.toLowerCase()}>
      {status}
    </p>
  )
}
