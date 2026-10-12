import { useEffect, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { keys } from '../../lib/queryKeys.js';
import { connectSocket } from '../../lib/socket.js';
import { fetchOrder, fetchOrders } from './api.js';
import { isClosed } from './status.js';

export const useOrders = () =>
  useInfiniteQuery({
    queryKey: keys.orders,
    queryFn: ({ pageParam }) => fetchOrders({ cursor: pageParam }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
    staleTime: 30_000,
  });

/**
 * Load an order and keep it live: the socket pushes status/payment changes (we refetch for the
 * full history) and rider location. Falls back to light polling if the socket is not connected.
 */
export function useLiveOrder(orderId) {
  const qc = useQueryClient();
  const [location, setLocation] = useState(null);
  const [live, setLive] = useState(false);

  const query = useQuery({
    queryKey: keys.order(orderId),
    queryFn: () => fetchOrder(orderId),
    refetchInterval: (q) =>
      q.state.data && isClosed(q.state.data.status) ? false : live ? 60_000 : 15_000,
  });

  useEffect(() => {
    const socket = connectSocket();
    const refresh = (p) => {
      if (p?._id === orderId) {
        qc.invalidateQueries({ queryKey: keys.order(orderId) });
        qc.invalidateQueries({ queryKey: keys.orders });
      }
    };
    const onLocation = (p) => p.orderId === orderId && setLocation(p);
    const subscribe = () =>
      socket.emit('order:subscribe', { orderId }, (ack) => {
        setLive(Boolean(ack?.ok));
        if (ack?.location) setLocation(ack.location);
      });

    socket.on('order:status', refresh);
    socket.on('order:payment', refresh);
    socket.on('order:location', onLocation);
    socket.on('connect', subscribe);
    socket.on('disconnect', () => setLive(false));
    if (socket.connected) subscribe();
    return () => {
      socket.emit('order:unsubscribe', { orderId });
      socket.off('order:status', refresh);
      socket.off('order:payment', refresh);
      socket.off('order:location', onLocation);
      socket.off('connect', subscribe);
    };
  }, [orderId, qc]);

  return { ...query, location, live };
}
