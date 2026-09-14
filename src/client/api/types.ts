// Shared types for the API service layer.

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
  /** Machine error code from the API's `error` field, when present. */
  code?: string;
}

export interface ApiPage<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export type ApiError = { code: string; message: string };
