/**
 * Helper utility for formatting time and date strings globally on the frontend.
 */

// Formats a raw time string (e.g. "14:30:00") into a localized 12-hour AM/PM string (e.g. "2:30 PM")
export const formatTimeString = (timeStrRaw) => {
  if (!timeStrRaw) return '—';
  const [h, m] = timeStrRaw.split(':');
  const d = new Date();
  d.setHours(parseInt(h, 10), parseInt(m, 10));
  // Use 'en-US' or default empty array for locale. Using empty array to respect user's system locale but forcing 12-hour
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase();
};

// Formats an ISO start and end date into: "Oct 12 • 2:00 PM - 3:00 PM"
export const formatTimeRange = (startIso, endIso) => {
  if (!startIso) return '—';
  const s = new Date(startIso);
  const options = { hour: 'numeric', minute: '2-digit', hour12: true };
  const dateStr = s.toLocaleDateString([], { month: 'short', day: 'numeric' });
  const startStr = s.toLocaleTimeString([], options).toUpperCase();
  const endStr = endIso ? new Date(endIso).toLocaleTimeString([], options).toUpperCase() : '';
  return `${dateStr} • ${startStr} ${endStr ? `- ${endStr}` : ''}`;
};
