"use server";

import { fetchBackendJson } from "@/lib/api/backend";

export interface MqttStreamTokenSession {
  token: string;
  expiresInSeconds: number;
  topics: string[];
  brokerConfigured: boolean;
}

/**
 * Requests a short-lived admin-only WebSocket ticket from FastAPI (`POST /mqtt/stream-token`)
 * using the server-side httpOnly session cookie.
 */
export async function createMqttMonitorSession(): Promise<MqttStreamTokenSession> {
  const result = await fetchBackendJson<MqttStreamTokenSession>(
    "/mqtt/stream-token",
    {
      method: "POST",
      includeAuth: true,
      timeoutMs: 8_000,
    },
  );

  if (!result.ok) {
    throw new Error(result.detail);
  }

  return result.data;
}
