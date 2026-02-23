import { useState, useEffect, useCallback } from 'react';
import type { EventRecord } from '@narc/shared';
import { fetchEvents, updateEventStatus, EventsFilter } from '../api/client';

interface UseEventsResult {
  events: EventRecord[];
  total: number;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  updateStatus: (id: string, status: string, notes?: string) => Promise<void>;
}

export function useEvents(filter: EventsFilter = {}): UseEventsResult {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filterKey = JSON.stringify(filter);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchEvents(filter);
      setEvents(data.events);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load events');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  // Initial load + polling every 30 seconds
  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
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

  return { events, total, loading, error, refresh: load, updateStatus };
}
