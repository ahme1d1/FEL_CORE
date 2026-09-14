
import { asFailure, mapPage, toNotificationKind, type PaginatedRaw } from './adapters.js';
import { apiFetch, ok } from './client.js';
import { HISTORY_CAPS } from './constants.js';
import type { ApiResponse } from './types.js';

export type NotificationKind =
  | 'goal'
  | 'assist'
  | 'yellow'
  | 'red'
  | 'injury'
  | 'price-up'
  | 'price-down'
  | 'deadline'
  | 'system';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  ts: number;
  read: boolean;
  playerId?: number;
  gw?: number;
}

/**
 * `GET /notifications` — paginated (default 20/max 100 per page). Fetches
 * one page at the max size (`HISTORY_CAPS.NOTIFICATIONS`) rather than
 * building full infinite-scroll: a real inbox is nowhere near
 * global-leaderboard scale, so one generous page covers the common case.
 */
export async function list(): Promise<ApiResponse<AppNotification[]>> {
  const res = await apiFetch<PaginatedRaw<AppNotification>>('/notifications', {
    query: { per_page: HISTORY_CAPS.NOTIFICATIONS },
  });
  if (!res.success || !res.data) return asFailure<AppNotification[]>(res);
  // toNotificationKind throws on drift — catch it so a single unrecognized
  // kind from the server surfaces as a clean failure, not a rejected
  // promise (which would strand the store's `hydrated` flag at false).
  try {
    return ok(mapPage(res.data).items.map((n) => ({ ...n, kind: toNotificationKind(n.kind) })));
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unrecognized data from API';
    return { success: false, data: null, error: message };
  }
}


/**
 * `PATCH /notifications/:id/read` — returns a small status object,
 * `{id, read: true}`, never the full list. `stores/notifications.ts` already
 * treats the response as opaque (patches `items` locally instead of
 * trusting `res.data`'s shape).
 */
export async function markRead(id: string): Promise<ApiResponse<{ id: string; read: boolean }>> {
  const res = await apiFetch<{ id: string; read: boolean }>(`/notifications/${id}/read`, { method: 'PATCH' });
  if (!res.success || !res.data) return asFailure<{ id: string; read: boolean }>(res);
  return ok(res.data);
}

/** `POST /notifications/read-all` — returns `{updated: number}`, never the full list. */
export async function markAllRead(): Promise<ApiResponse<{ updated: number }>> {
  const res = await apiFetch<{ updated: number }>('/notifications/read-all', { method: 'POST' });
  if (!res.success || !res.data) return asFailure<{ updated: number }>(res);
  return ok(res.data);
}

/** `DELETE /notifications` — returns `{deleted: number}`; discarded, callers only need success. */
export async function clear(): Promise<ApiResponse<null>> {
  const res = await apiFetch<{ deleted: number }>('/notifications', { method: 'DELETE' });
  if (!res.success) return asFailure<null>(res);
  return ok(null);
}

/**
 * `GET /notifications/unread-count` — not called by the store today (it
 * derives `unreadCount` locally from `items`), but typed/parsed against the
 * real contract now so a future direct consumer doesn't break: the response
 * wraps the count as `{count}`, never a bare number.
 */
export async function unreadCount(): Promise<ApiResponse<number>> {
  const res = await apiFetch<{ count: number }>('/notifications/unread-count');
  if (!res.success || res.data == null) {
    return { success: false, data: null, error: res.error, code: res.code };
  }
  return ok(res.data.count);
}
