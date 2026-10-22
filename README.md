# Meta Pixel and Conversions API tracking fixes: a field guide to the bugs that cost you data

**Meta pixel double counting, Conversions API not matching, purchase events missing: most of these come down to six causes.** Two pixels on one page, the wrong client IP behind Cloudflare, missing or badly hashed customer data, no shared event ID, a changed Stripe object, and checking the dashboard instead of the network request. This guide gives you the symptom, the cause and the fix for each, with small code snippets you can copy.

Built for marketing agencies running paid Meta campaigns for clients. Based on bugs we hit on real client campaigns.

## Symptom, cause and fix at a glance

| Symptom | Likely cause | Fix |
|---|---|---|
| Events show up on the wrong pixel, or counts look doubled | Two pixels initialised, events sent with `fbq('track')` | Use `fbq('trackSingle', pixelId, ...)` |
| Same lead counted twice | Browser and server both fire, no shared ID | Send the same `event_id` / `eventID` on both |
| Low match quality on server events | Missing `fbc`, `fbp`, IP, user agent, or unhashed email | Send all of them, hash only email and phone |
| Server events show a weird IP | Behind Cloudflare, reading the wrong header | Read `cf-connecting-ip` first |
| Phone numbers never match | No country code, spaces, leading zero | Digits only, country code, then hash |
| Purchase event never fires from Stripe | Code reads `paymentIntent.charges`, which newer API versions removed | Read `latest_charge` |
| Pixel fires before the visitor accepts cookies | Pixel loads at page start | Load or init it only after consent |
| Dashboard shows no Lead, but you think it works | Stats lag | Check the network request, not the dashboard |
| Landing page views far below link clicks | Pixel script missing from the page HTML | Check the rendered page for `fbq(` on every route |

## How do I stop Meta pixel double counting with two pixels on one page?

If you initialise two pixels, `fbq('track', 'Lead')` fires on **both**. Meta's multi-pixel guide explains why: each `init` is stored in a global queue, and every later `track` call fires for all of them.

Fix: name the pixel in the call.

```js
fbq('init', 'PIXEL_A');
fbq('init', 'PIXEL_B');

fbq('trackSingle', 'PIXEL_A', 'Lead', {}, { eventID: 'abc-123' });
fbq('trackSingleCustom', 'PIXEL_B', 'Step4', {}, { eventID: 'def-456' });
```

Rules we use:

1. Use `trackSingle` and `trackSingleCustom` for every event once a second pixel exists.
2. Use plain `track` only for events you want on every pixel.
3. Search your code and your tag manager for leftover `fbq('track'` calls.

Full example: [snippets/track-single.js](snippets/track-single.js)

## How do I fix Conversions API events not matching browser events?

Meta can only link a server event to a person if you send enough data. Send these with every CAPI event:

| Field | Hash it? | Notes |
|---|---|---|
| `em` (email) | Yes, SHA-256 | Trim and lowercase first |
| `ph` (phone) | Yes, SHA-256 | Digits only, with country code, no leading zeros |
| `client_ip_address` | **No** | Must never be hashed |
| `client_user_agent` | **No** | Send the visitor's browser string, not your server's |
| `fbc` | **No** | From the `_fbc` cookie, as-is |
| `fbp` | **No** | From the `_fbp` cookie, as-is |
| `external_id` | Optional, hashing recommended | Your own customer ID |

Hash `external_id` with SHA-256 after trimming and lowercasing, the same way as email.

Steps:

1. Read the `_fbc` and `_fbp` cookies in the browser and post them to your server with the form.
2. Capture the visitor IP and user agent on the request that handles the form.
3. Normalise and hash email and phone.
4. Build the event and POST it to the Conversions API.

Australian phone numbers: `0412 345 678` becomes `61412345678`, then SHA-256. Drop the zero, add `61`, keep digits only. The snippet only adds your country code to national-format numbers (leading 0, or 10 digits or fewer). Numbers with `+` or `00` are left as they are. You must pass the country code yourself.

Full builder with hashing: [snippets/capi-payload.ts](snippets/capi-payload.ts)

## How do I fix the wrong client IP in Conversions API behind Cloudflare?

Behind Cloudflare, the IP your server sees on the socket is a Cloudflare edge IP. A wrong IP lowers match quality.

Use this order:

1. `cf-connecting-ip`: the single visitor IP.
2. `true-client-ip`: Enterprise only, same value.
3. First entry of `x-forwarded-for`: last resort. Cloudflare appends proxy IPs to this header, so it can be a chain.

Cloudflare's own docs say `cf-connecting-ip` and `true-client-ip` have a consistent single-IP format, and that `x-forwarded-for` is not recommended for identifying visitors.

Two cautions:

- Only trust these headers when all traffic to your origin comes through Cloudflare. Otherwise anyone can fake them.
- Do not hash the IP.

Helper: [snippets/cloudflare-ip.ts](snippets/cloudflare-ip.ts)

## How do I deduplicate browser and server events?

Fire the event in the browser and on the server, with the **same event ID**. Meta keeps one.

Rules from Meta's dedup docs:

1. The browser `eventID` must equal the server `event_id`.
2. The browser event name must equal the server `event_name`.
3. Both must go to the same pixel.
4. Matching works within 48 hours.

Steps:

1. Make an ID when the user acts: `const id = crypto.randomUUID()`.
2. Pass it to the pixel: `fbq('track', 'Lead', {}, { eventID: id })`.
3. Send it to your server with the form data.
4. Use it as `event_id` in the CAPI payload.

For a purchase, store the ID in the Stripe PaymentIntent metadata so the webhook can reuse it.

## How do I track leads with the Meta pixel and CAPI?

Fire `Lead` twice for the same submit: once in the browser, once on the server.

1. On form submit, create the event ID.
2. Fire `Lead` in the browser with that ID.
3. Post the form, the ID, `_fbc`, `_fbp` to your server.
4. On the server, add IP and user agent, hash email and phone, send `Lead` through CAPI with the same ID.
5. Test with a test event code, then remove it.

Why both? The browser event survives if your server fails. The server event survives ad blockers and browser limits. Dedup stops the double count.

## Why is my Facebook Purchase event not showing from Stripe?

Stripe API version `2022-11-15` removed the `charges` list from the PaymentIntent. Code that reads `paymentIntent.charges.data[0]` returns nothing on newer versions, so the Purchase event never gets built.

Fix: read `latest_charge`, and expand it if you need the Charge object.

```ts
const pi = await stripe.paymentIntents.retrieve(id, { expand: ['latest_charge'] });
const charge = pi.latest_charge as Stripe.Charge;
```

Also check:

- `value` is in major units (`49.00`, not `4900`).
- `currency` is set.
- You have the browser `fbc`, `fbp`, IP and user agent from checkout. A webhook has no browser, so save them in the PaymentIntent metadata at checkout.

Example: [snippets/stripe-purchase.ts](snippets/stripe-purchase.ts)

## How do I make the pixel respect cookie consent?

If your site needs consent, the pixel must not send events before the visitor says yes.

1. Do not call `fbq('init')` or `fbq('track')` until consent is given.
2. When consent arrives, load the pixel, init it, then send the PageView.
3. Check in the Network tab with consent denied. There should be no `facebook.com/tr` requests.
4. Server events need the same rule: do not send CAPI events for people who declined.

## How do I check that tracking really works?

Do not start with the dashboard. Pixel stats lag.

1. Open DevTools, Network, filter `facebook.com/tr`.
2. Submit the form.
3. Find the request with `ev=Lead`.
4. Confirm status `200` and the right `id=` (pixel).
5. Send a CAPI test event and confirm `events_received: 1`.

Also check that the pixel code is on every page. Symptom: events fire on one route and never on another. Check: open view-source on each route and search for `fbq(`.

Then confirm in a normal browser with the Meta Pixel Helper extension installed. It shows which pixel IDs load and which events fire on that page.

Full list: [checklists/verify-tracking.md](checklists/verify-tracking.md)

## FAQ

**Why does my pixel count every lead twice?**
Usually browser and server events without a shared `event_id`, or two pixels on one page with `fbq('track')`. Fix with matching IDs and `trackSingle`.

**Do I hash the IP address and user agent?**
No. Only email and phone are hashed. IP, user agent, `fbc` and `fbp` are sent as-is.

**What phone format does Meta want?**
Digits only, with the country code, no symbols, no leading zeros. Then SHA-256.

**Which header has the real IP behind Cloudflare?**
`cf-connecting-ip`. Treat `x-forwarded-for` as a fallback.

**Why do I see no data in Events Manager right after testing?**
Stats lag. Check the `facebook.com/tr` request for a `200` and the CAPI response first.

**Is the pixel enough, or do I need CAPI too?**
Run both. They back each other up, and dedup keeps the count clean.

## Where these numbers come from

Tracking like this sits behind results we've hit on client campaigns: $3.08 per lead, $4.93 per website-scheduled lead, $0.82 per guide download, and 6.41x ROAS. Clean events are what let Meta optimise toward them.

## Want the full kit?

Fixing tracking is one job in an agency's week. The rest is ad management, creative and reporting. The Claude Skills Library Pro from Varritech is a kit of skills for marketing agencies with 3+ people who want to automate their internals and client delivery. Installed into your favourite AI: Claude Code, Claude, ChatGPT or Codex. It is $47.

[Get the Claude Skills Library Pro](https://www.varritech.com/products/claude-skills-library-pro?utm_source=github&utm_medium=repo&utm_campaign=meta-pixel-capi-tracking-fixes)

Made by Cristiano Varriale, founder of Varritech. Questions: hello@varritech.com
