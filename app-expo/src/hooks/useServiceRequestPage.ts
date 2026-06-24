import { useCallback, useEffect, useState } from 'react';

import type { ApiClient } from '../../../app/src/services/apiClient';
import type { ServiceRequest, ServiceRequestStatus } from '../../../shared/schemas';

const PAGE_SIZE = 20;

export interface UseServiceRequestPageOptions {
  client: ApiClient;
  status: ServiceRequestStatus | null;
  q: string;
  /** Bump from the parent (e.g. on focus) to reset to the first page. */
  refreshToken?: number;
  errorMessage: string;
  /** Called after a first-page (re)load settles — e.g. to stop a refresh spinner. */
  onSettled?: () => void;
}

export interface ServiceRequestPageResult {
  items: ServiceRequest[] | null;
  total: number;
  error: string | null;
  loadingMore: boolean;
  hasMore: boolean;
  /** Fetch and append the next page. */
  loadMore: () => Promise<void>;
  /** Reset back to the first page (e.g. after a mutation or pull-to-refresh). */
  reload: () => void;
}

/**
 * Loads a paginated service-request list with "load more" support. Resets to the
 * first page whenever the status, keyword, refreshToken, or `reload()` changes.
 * Keeps the list/pagination concern out of each screen so customer, worker, and
 * admin lists share one implementation.
 */
export function useServiceRequestPage(
  options: UseServiceRequestPageOptions,
): ServiceRequestPageResult {
  const { client, status, q, refreshToken, errorMessage, onSettled } = options;

  const [items, setItems] = useState<ServiceRequest[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const queryParams = useCallback(
    (offset: number) => ({
      status: status ?? undefined,
      q: q.trim() === '' ? undefined : q.trim(),
      limit: PAGE_SIZE,
      offset,
    }),
    [status, q],
  );

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      try {
        const page = await client.listServiceRequests(queryParams(0));
        if (active) {
          setItems(page.items);
          setTotal(page.total);
          setError(null);
        }
      } catch {
        if (active) {
          setError(errorMessage);
        }
      } finally {
        if (active) {
          onSettled?.();
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [client, queryParams, refreshToken, reloadKey, errorMessage, onSettled]);

  const loadMore = useCallback(async (): Promise<void> => {
    if (items === null || items.length >= total || loadingMore) {
      return;
    }
    setLoadingMore(true);
    try {
      const page = await client.listServiceRequests(queryParams(items.length));
      setItems((current) => [...(current ?? []), ...page.items]);
      setTotal(page.total);
    } catch {
      // Keep the current page on failure; the user can retry.
    } finally {
      setLoadingMore(false);
    }
  }, [client, items, total, loadingMore, queryParams]);

  const reload = useCallback(() => {
    setReloadKey((current) => current + 1);
  }, []);

  return {
    items,
    total,
    error,
    loadingMore,
    hasMore: items !== null && items.length < total,
    loadMore,
    reload,
  };
}
