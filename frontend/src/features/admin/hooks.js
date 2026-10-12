import { useEffect, useRef } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrapWithMeta } from '../../lib/axios.js';
import { connectSocket } from '../../lib/socket.js';
import { useUiStore, toast } from '../ui/uiStore.js';
import { playAlert } from './sound.js';

/**
 * Cursor-paginated admin list.
 * @param {string[]} key query key
 * @param {string} url endpoint (e.g. '/users')
 * @param {object} [params] extra query params
 */
export function useAdminList(key, url, params = {}) {
  return useInfiniteQuery({
    queryKey: ['admin', ...key, params],
    queryFn: ({ pageParam }) =>
      api.get(url, { params: { ...params, cursor: pageParam, limit: 30 } }).then(unwrapWithMeta),
    initialPageParam: undefined,
    getNextPageParam: (l) => l.meta?.nextCursor ?? undefined,
    staleTime: 15_000,
  });
}
export const flatten = (data) => data?.pages.flatMap((p) => p.data) ?? [];

/**
 * Staff realtime: new orders / bookings / party inquiries refresh the relevant lists and raise a toast.
 * New kitchen orders also ring the alert if sound is enabled.
 */
export function useStaffRealtime() {
  const qc = useQueryClient();
  const soundOn = useUiStore((s) => s.soundOn);
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;

  useEffect(() => {
    const socket = connectSocket();
    const refresh = (...keys) =>
      keys.forEach((k) => qc.invalidateQueries({ queryKey: ['admin', k] }));
    const onOrder = (o) => {
      refresh('orders', 'dashboard');
      toast.info(`New order ${o.orderNumber}`);
      if (soundRef.current) playAlert();
    };
    const onOrderStatus = () => refresh('orders', 'dashboard');
    const onBooking = (b) => {
      refresh('bookings');
      toast.info(`New booking ${b.bookingNumber}`);
    };
    const onParty = (p) => {
      refresh('party');
      toast.info(`Party inquiry ${p.inquiryNumber}`);
    };
    socket.on('order:new', onOrder);
    socket.on('order:status', onOrderStatus);
    socket.on('booking:new', onBooking);
    socket.on('booking:update', () => refresh('bookings'));
    socket.on('party:new', onParty);
    socket.on('party:update', () => refresh('party'));
    return () => {
      socket.off('order:new', onOrder);
      socket.off('order:status', onOrderStatus);
      socket.off('booking:new', onBooking);
      socket.off('booking:update');
      socket.off('party:new', onParty);
      socket.off('party:update');
    };
  }, [qc]);
}

/** Repeat the alert every `everyMs` while `active` (unaccepted orders) and sound is on. */
export function useRepeatingAlert(active, everyMs = 12_000) {
  const soundOn = useUiStore((s) => s.soundOn);
  useEffect(() => {
    if (!active || !soundOn) return undefined;
    const t = setInterval(playAlert, everyMs);
    return () => clearInterval(t);
  }, [active, soundOn, everyMs]);
}
