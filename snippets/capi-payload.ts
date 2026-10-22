// Build a Conversions API event with correctly hashed user data.
// Runs on Node 18+. Needs your own pixel ID and access token in env vars.
// Hash em, ph. Never hash client_ip_address, client_user_agent, fbc, fbp.

import { createHash } from 'node:crypto';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

export function hashEmail(email?: string): string | undefined {
  if (!email) return undefined;
  const clean = email.trim().toLowerCase();
  return clean ? sha256(clean) : undefined;
}

// Meta wants digits only, with the country code, no leading zeros, no "+".
// Australian example: "0412 345 678" with country "61" -> "61412345678".
// defaultCountryCode is required: pass the code for your customers' home market
// (for example from an env var). It is only added to national-format numbers:
//   - a leading "+" or "00" means the number already has a country code
//   - a leading "0" means national format, so the 0 is dropped and the code added
//   - otherwise, 10 digits or fewer is treated as national, longer as international
export function hashPhone(phone: string | undefined, defaultCountryCode: string): string | undefined {
  if (!phone) return undefined;
  const trimmed = phone.trim();
  let digits = trimmed.replace(/\D/g, '');
  if (!digits) return undefined;
  const international = trimmed.startsWith('+') || digits.startsWith('00');
  if (international) {
    digits = digits.replace(/^0+/, '');
  } else if (digits.startsWith('0') || digits.length <= 10) {
    digits = defaultCountryCode + digits.replace(/^0+/, '');
  }
  return sha256(digits);
}

export interface LeadInput {
  eventId: string;          // SAME id you passed to fbq(..., { eventID })
  eventName: 'Lead' | 'Purchase' | string;
  sourceUrl: string;        // page where the action happened
  email?: string;
  phone?: string;
  defaultCountryCode?: string; // e.g. '61'. Falls back to env DEFAULT_PHONE_COUNTRY_CODE
  ip?: string;             // from getClientIp()
  userAgent?: string;       // request header user-agent
  fbc?: string;             // _fbc cookie, as-is
  fbp?: string;             // _fbp cookie, as-is
  value?: number;           // major units, e.g. 49.00
  currency?: string;        // e.g. 'USD'
}

export function buildCapiEvent(i: LeadInput) {
  const cc = i.defaultCountryCode ?? process.env.DEFAULT_PHONE_COUNTRY_CODE;
  if (i.phone && !cc) throw new Error('Set defaultCountryCode or DEFAULT_PHONE_COUNTRY_CODE');
  const user_data: Record<string, unknown> = {
    em: hashEmail(i.email) && [hashEmail(i.email)],
    ph: hashPhone(i.phone, cc!) && [hashPhone(i.phone, cc!)],
    client_ip_address: i.ip,
    client_user_agent: i.userAgent,
    fbc: i.fbc,
    fbp: i.fbp,
  };
  for (const k of Object.keys(user_data)) if (user_data[k] === undefined) delete user_data[k];

  return {
    event_name: i.eventName,
    event_time: Math.floor(Date.now() / 1000), // seconds, not milliseconds
    event_id: i.eventId,
    event_source_url: i.sourceUrl,
    action_source: 'website',
    user_data,
    ...(i.value !== undefined && {
      custom_data: { value: i.value, currency: i.currency ?? 'USD' },
    }),
  };
}

export async function sendCapi(events: ReturnType<typeof buildCapiEvent>[]) {
  const pixelId = process.env.META_PIXEL_ID!;
  const token = process.env.META_CAPI_TOKEN!;
  // The token goes in the JSON body, not the URL, so it stays out of access logs.
  const res = await fetch(
    `https://graph.facebook.com/v24.0/${pixelId}/events`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        access_token: token,
        data: events,
        // test_event_code: 'TEST12345', // from Events Manager > Test Events. Remove for live.
      }),
    },
  );
  const json = await res.json();
  if (!res.ok) throw new Error(`CAPI ${res.status}: ${JSON.stringify(json)}`);
  return json; // { events_received: n, ... }
}
