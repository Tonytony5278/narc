import { useState, useEffect, useCallback, useRef } from 'react';
import type { EventRecord } from '@narc/shared';
import { fetchEvents, updateEventStatus, EventsFilter } from '../api/client';

interface UseEventsResult {
  events: EventRecord[];
  total: number;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  updateStatus: (id: string, status: string, notes?: string) => Promise<void>;
  newEvents: EventRecord[];
  clearNewEvents: () => void;
}

export function useEvents(filter: EventsFilter = {}): UseEventsResult {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newEvents, setNewEvents] = useState<EventRecord[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const isFirstLoadRef = useRef(true);

  const filterKey = JSON.stringify(filter);

  const load = useCallback(async () => {
    try {
      // Only show the loading skeleton on the very first fetch.
      // Background polls must be silent so an open modal is never unmounted.
      if (isFirstLoadRef.current) {
        setLoading(true);
      }
      setError(null);
      const data = await fetchEvents(filter);

      // Detect genuinely new events (not on first load)
      if (!isFirstLoadRef.current) {
        const incoming = data.events.filter((e) => !seenIdsRef.current.has(e.id));
        if (incoming.length > 0) {
          setNewEvents((prev) => [...incoming, ...prev]);
        }
      } else {
        isFirstLoadRef.current = false;
      }

      // Track all seen IDs
      data.events.forEach((e) => seenIdsRef.current.add(e.id));
      setEvents(data.events);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load events');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  // Initial load + polling every 10 seconds
  useEffect(() => {
    load();
    const interval = setInterval(load, 10_000);
    return () => clearInterval(interval);
  }, [load]);

  const updateStatus = useCallback(
    async (id: string, status: string, notes?: string) => {
      await updateEventStatus(id, status, notes);
      // Optimistically update local state
      setEvents((prev) =>
        prev.map((e) => (e.id === id ? { ...e, status: status as EventRecord['status'] } : e))
      );
    },
    []
  );

  const clearNewEvents = useCallback(() => setNewEvents([]), []);

  return { events, total, loading, error, refresh: load, updateStatus, newEvents, clearNewEvents };
}
