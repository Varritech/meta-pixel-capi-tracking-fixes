// Pick the real visitor IP for Conversions API behind Cloudflare.
// Order: cf-connecting-ip, then true-client-ip, then the FIRST x-forwarded-for entry.
// Cloudflare says cf-connecting-ip holds a single IP. x-forwarded-for can be a
// comma-separated chain that contains proxy IPs.
// Do not hash the IP. Meta wants client_ip_address as-is (IPv4 or IPv6).

type HeaderGetter = { get(name: string): string | null };

export function getClientIp(headers: HeaderGetter): string | undefined {
  const cf = headers.get('cf-connecting-ip');
  if (cf) return cf.trim();

  const tci = headers.get('true-client-ip'); // Enterprise only, same value as cf-connecting-ip
  if (tci) return tci.trim();

  const xff = headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim(); // last resort, may be wrong

  return undefined;
}

// Only trust these headers if all traffic to your origin comes through Cloudflare.
// If someone can hit your origin directly, they can send any header they like.
// Lock the origin down (Authenticated Origin Pulls or Cloudflare Tunnel).

// Next.js route handler:
//   const ip = getClientIp(request.headers);
// Express:
//   const ip = getClientIp({ get: (n) => req.get(n) ?? null });
