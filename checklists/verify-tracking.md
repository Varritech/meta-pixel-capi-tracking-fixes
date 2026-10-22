# Verify Meta tracking checklist

Run this after any change to the pixel, the form, the checkout or the server code.
Do not trust the Events Manager numbers first. They lag. Check the network request.

## 1. Is the pixel on the page?

- [ ] View source or run `curl -s <url> | grep -c "fbq("` for each route that matters (landing page, form, thank-you, checkout).
- [ ] If a script is added after load, check the rendered page in a real browser instead of curl.
- [ ] View-source on each route and search for `fbq(`. Then test in a normal browser with the Meta Pixel Helper extension.

## 2. Does the browser event fire?

1. Open DevTools, Network tab, filter `facebook.com/tr`.
2. Do the action (submit the form, pay in test mode).
3. Find the request with `ev=Lead` (or `ev=Purchase`).
4. Check: status is `200`, `id=` is the right pixel, `ev=` is the right event.
5. If you run two pixels, confirm each event hit only the pixel you meant.

## 3. Is the event ID set?

- [ ] The browser request has an event ID (`eid=` in the request).
- [ ] The same ID is sent to your server and used as `event_id` in the CAPI call.
- [ ] `event_name` is spelled exactly the same on both sides.

## 4. Does the server event arrive?

- [ ] Use a test event code from Events Manager > Test Events.
- [ ] Send one event. The response should say `events_received: 1`.
- [ ] The event shows in Test Events as "Server", and is marked deduplicated when the browser one matches.
- [ ] Remove the test code before you go live.

## 5. Is the match data good?

- [ ] `client_ip_address` is the visitor IP (behind Cloudflare: `cf-connecting-ip`), not an edge or server IP.
- [ ] `client_user_agent` is the visitor browser, not your server.
- [ ] `fbc` and `fbp` are sent when the cookies exist.
- [ ] `em` and `ph` are SHA-256 hashes of normalised values. Phone has a country code.
- [ ] IP, user agent, `fbc` and `fbp` are NOT hashed.

## 6. Consent

- [ ] With consent denied, no `facebook.com/tr` request fires.
- [ ] After the visitor accepts, the PageView and the next events fire.

## 7. Purchases

- [ ] The value is in major units (49.00, not 4900).
- [ ] The currency code is set.
- [ ] You read the charge from `latest_charge`, not from `charges`.

## 8. Only then, the dashboard

- [ ] Events Manager shows the event. Allow time. Stats can lag.
- [ ] Check the Diagnostics tab for match quality or dedup warnings.
