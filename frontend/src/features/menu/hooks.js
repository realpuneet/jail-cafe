import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { keys } from '../../lib/queryKeys.js';
import {
  fetchBanners,
  fetchCategories,
  fetchMenu,
  fetchMenuItem,
  fetchPublicCoupons,
} from './api.js';

const FIVE_MIN = 5 * 60_000;

export const useCategories = () =>
  useQuery({ queryKey: keys.categories, queryFn: fetchCategories, staleTime: FIVE_MIN });
export const useMenu = () =>
  useQuery({ queryKey: keys.menu, queryFn: fetchMenu, staleTime: FIVE_MIN });
export const useBanners = (position) =>
  useQuery({
    queryKey: keys.banners(position),
    queryFn: () => fetchBanners(position),
    staleTime: FIVE_MIN,
  });
export const usePublicCoupons = () =>
  useQuery({ queryKey: keys.coupons, queryFn: fetchPublicCoupons, staleTime: FIVE_MIN });
export const useMenuItem = (slug) =>
  useQuery({
    queryKey: [...keys.menu, slug],
    queryFn: () => fetchMenuItem(slug),
    staleTime: FIVE_MIN,
    enabled: Boolean(slug),
  });

/**
 * Menu filtered on the client (the whole public menu is small and cached by the server, so
 * search/veg filtering is instant and costs no requests).
 */
export function filterMenu(items, { q = '', veg = false, categoryId = null } = {}) {
  const needle = q.trim().toLowerCase();
  return items.filter((i) => {
    if (veg && !i.isVeg) return false;
    if (categoryId && i.categoryId !== categoryId) return false;
    if (!needle) return true;
    return [i.name, i.description, ...(i.tags ?? [])].some((t) =>
      t?.toLowerCase().includes(needle),
    );
  });
}

/** Group items by category, keeping category display order and skipping empty groups. */
export function groupByCategory(categories, items) {
  const byCat = new Map(categories.map((c) => [c._id, { category: c, items: [] }]));
  for (const item of items) byCat.get(item.categoryId)?.items.push(item);
  return [...byCat.values()].filter((g) => g.items.length);
}

export function useGroupedMenu(filters) {
  const categories = useCategories();
  const menu = useMenu();
  const { q, veg, categoryId } = filters;
  const groups = useMemo(
    () =>
      categories.data && menu.data
        ? groupByCategory(categories.data, filterMenu(menu.data, { q, veg, categoryId }))
        : [],
    [categories.data, menu.data, q, veg, categoryId],
  );
  return {
    groups,
    categories: categories.data ?? [],
    isLoading: categories.isLoading || menu.isLoading,
    isError: categories.isError || menu.isError,
    refetch: () => {
      categories.refetch();
      menu.refetch();
    },
  };
}
