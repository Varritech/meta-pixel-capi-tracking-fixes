// Two pixels on one page? Use trackSingle so each event goes to ONE pixel.
// fbq('track', ...) fires on every pixel you have initialised.
// Source: Meta's "Track Multiple Events" guide (trackSingle / trackSingleCustom).

const PIXEL_A = 'YOUR_PIXEL_ID_A'; // e.g. your own pixel
const PIXEL_B = 'YOUR_PIXEL_ID_B'; // e.g. a second pixel on the same page

// Base code loads fbevents.js once. Then init both pixels.
fbq('init', PIXEL_A);
fbq('init', PIXEL_B);

// PageView on a plain track call goes to BOTH pixels. Only do this if you want that.
fbq('track', 'PageView');

// Lead for pixel A only. The 4th argument is the event ID used for dedup.
function trackLead(pixelId, eventId, params = {}) {
  fbq('trackSingle', pixelId, 'Lead', params, { eventID: eventId });
}

// Custom event for pixel B only.
function trackCustomOn(pixelId, name, params = {}, eventId) {
  fbq('trackSingleCustom', pixelId, name, params, eventId ? { eventID: eventId } : undefined);
}

// Example: a form submit that belongs to pixel A only.
// const eventId = crypto.randomUUID();
// trackLead(PIXEL_A, eventId, { content_name: 'Free guide' });
// then send the same eventId to your server for the CAPI call.
