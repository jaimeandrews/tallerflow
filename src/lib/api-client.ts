"use client";

import { toast } from "sonner";

async function apiFetch<T>(
  url: string,
  init?: RequestInit & { token?: string },
  retries = 1
): Promise<T> {
  const { token, ...rest } = init ?? {};

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(rest.headers as Record<string, string> | undefined),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    const res = await fetch(url, { ...rest, headers });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const message = (data as { error?: string }).error ?? `Error ${res.status}`;
      toast.error(message);
      throw new Error(message);
    }

    return res.json() as Promise<T>;
  } catch (err) {
    if (retries > 0 && err instanceof TypeError) {
      await new Promise((r) => setTimeout(r, 2000));
      return apiFetch<T>(url, init, retries - 1);
    }
    throw err;
  }
}

export const apiClient = {
  get: <T>(url: string, token?: string) => apiFetch<T>(url, { method: "GET", token }),

  post: <T>(url: string, body: unknown, token?: string) =>
    apiFetch<T>(url, {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),
};
