import { apiFetch } from './client.js';
import type { ApiResponse } from './types.js';

/**
 * `POST /contact` (public marketing-site form, 3/hour/IP throttle). Field
 * shapes + limits mirror FEL_API's `CreateContactDto` byte-for-byte
 * (DB inbox only, no `mailto:` fallback).
 */
export interface ContactSubmission {
  name: string;
  email: string;
  subject?: string;
  message: string;
  /** Honeypot — always sent empty by the real form; a bot filling it gets a silent fake-success. */
  website?: string;
}

export async function submitContact(input: ContactSubmission): Promise<ApiResponse<{ ok: true }>> {
  return apiFetch<{ ok: true }>('/contact', { method: 'POST', body: { ...input }, skipAuth: true });
}
