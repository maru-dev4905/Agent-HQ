type Listener = () => void;

/**
 * In-process "workspace has new events" signal. Carries no data: listeners read the events
 * themselves from the event store by cursor, so a lost or duplicated signal can only delay
 * delivery, never drop or repeat an event.
 */
export class WorkspaceSignals {
  private readonly listeners = new Map<string, Set<Listener>>();

  subscribe(workspaceId: string, listener: Listener): () => void {
    const set = this.listeners.get(workspaceId) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(workspaceId, set);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(workspaceId);
    };
  }

  notify(workspaceId: string): void {
    for (const listener of this.listeners.get(workspaceId) ?? []) listener();
  }

  listenerCount(workspaceId: string): number {
    return this.listeners.get(workspaceId)?.size ?? 0;
  }
}
