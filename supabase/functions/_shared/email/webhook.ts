import { Buffer } from "node:buffer";
import { createPublicKey, verify } from 'node:crypto';

export function verifySendGridSignature(raw: string, timestamp: string | null, signature: string | null, publicKey: string): boolean {
  if (!timestamp || !signature) return false;
  try {
    const key = createPublicKey(`-----BEGIN PUBLIC KEY-----\n${publicKey}\n-----END PUBLIC KEY-----`);
    return verify('sha256', Buffer.from(timestamp + raw), key, Buffer.from(signature, 'base64'));
  } catch { return false; }
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isCampaignEvent(ev: unknown): ev is Record<string, unknown> {
  if (!ev || typeof ev !== 'object' || Array.isArray(ev)) return false;
  const value = ev as Record<string, unknown>;
  return typeof value.recipient_id === 'string' && UUID.test(value.recipient_id)
    && typeof value.campaign_id === 'string' && UUID.test(value.campaign_id)
    && typeof value.timestamp === 'number' && Number.isFinite(value.timestamp)
    && value.timestamp > 0 && value.timestamp < 8640000000000;
}
