import { useEffect, useState } from 'react';

import type { ApiClient } from '../../../app/src/services/apiClient';
import type { ServiceRequest } from '../../../shared/schemas';

/**
 * Resolves a `customerId → displayName` map for the given requests in one
 * best-effort batch call. Re-resolves when the request list changes; a failed
 * lookup just yields no names (never throws). Shared by the worker and admin
 * lists so the lookup logic lives in one place.
 */
export function useCustomerNames(
  client: ApiClient,
  requests: ServiceRequest[] | null,
): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      if (requests === null) {
        return;
      }
      try {
        const ids = [...new Set(requests.map((request) => request.customerId))];
        const users = await client.listUsers(ids);
        if (active) {
          const map: Record<string, string> = {};
          for (const user of users) {
            map[user.id] = user.displayName;
          }
          setNames(map);
        }
      } catch {
        // Customer names are secondary; ignore failures.
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [client, requests]);

  return names;
}
