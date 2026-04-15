import type { IpcResponse } from "@magenta/shared/ipc";

/**
 * Narrow dependency interface for anything that fans out IPC push events.
 *
 * Services in the data-access layer (ScanQueue, SpecSyncService, …) used to
 * depend directly on {@link IPCBridge}, which creates an upward dependency:
 * `services/ → ipc/`. The IPC layer is supposed to depend on services, not
 * the other way around. Depending on this interface instead keeps the
 * services/ directory free of `ipc/` imports while still letting
 * `IPCBridge` satisfy the contract (its `emit()` signature already matches).
 *
 * Anything implementing this interface is free to forward the event
 * anywhere — process.send(), a local test double, a fanout to multiple
 * subscribers — without the service needing to know.
 */
export interface IpcEventSink {
  emit<TResponse extends IpcResponse>(event: TResponse): void;
}
