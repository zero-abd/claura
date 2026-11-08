// SF-Symbols-style line icons. 24x24 grid, 1.6 stroke, round caps and joins.
const P: Record<string, string> = {
  overview: `<rect x="3.6" y="3.6" width="7" height="7" rx="2.2"/><rect x="13.4" y="3.6" width="7" height="7" rx="2.2"/><rect x="3.6" y="13.4" width="7" height="7" rx="2.2"/><rect x="13.4" y="13.4" width="7" height="7" rx="2.2"/>`,
  incident: `<path d="M12 3.2 19 6v5.2c0 4.5-2.9 7.9-7 9.6-4.1-1.7-7-5.1-7-9.6V6z"/><path d="M12 8.3v4.2"/><path d="M12 15.6h.01"/>`,
  agents: `<rect x="6.5" y="6.5" width="11" height="11" rx="3.2"/><rect x="9.9" y="9.9" width="4.2" height="4.2" rx="1.3"/><path d="M9.6 3.6v2.9M14.4 3.6v2.9M9.6 17.5v2.9M14.4 17.5v2.9M3.6 9.6h2.9M3.6 14.4h2.9M17.5 9.6h2.9M17.5 14.4h2.9"/>`,
  policy: `<path d="M4 7.5h8.3M17.3 7.5H20M4 16.5h2.7M11.7 16.5H20"/><circle cx="14.8" cy="7.5" r="2.5"/><circle cx="9.2" cy="16.5" r="2.5"/>`,
  reports: `<path d="M7.2 3.6h6.6L18.6 8.4v10.2a1.8 1.8 0 0 1-1.8 1.8H7.2a1.8 1.8 0 0 1-1.8-1.8V5.4a1.8 1.8 0 0 1 1.8-1.8z"/><path d="M13.6 3.9v4.3a.5.5 0 0 0 .5.5h4.3"/><path d="M8.7 12.6h6.6M8.7 15.7h4.4"/>`,
  chevron: `<path d="m9.2 5.8 6.2 6.2-6.2 6.2"/>`,
  check: `<path d="m5.4 12.6 4.3 4.3 8.9-9.6"/>`,
  lock: `<rect x="5.2" y="10.6" width="13.6" height="9.4" rx="3"/><path d="M8.6 10.6V8.2a3.4 3.4 0 0 1 6.8 0v2.4"/>`,
  shield: `<path d="M12 3.2 19 6v5.2c0 4.5-2.9 7.9-7 9.6-4.1-1.7-7-5.1-7-9.6V6z"/>`,
  shieldCheck: `<path d="M12 3.2 19 6v5.2c0 4.5-2.9 7.9-7 9.6-4.1-1.7-7-5.1-7-9.6V6z"/><path d="m8.7 12.1 2.4 2.4 4.3-4.7"/>`,
  shieldLock: `<path d="M12 3.2 19 6v5.2c0 4.5-2.9 7.9-7 9.6-4.1-1.7-7-5.1-7-9.6V6z"/><rect x="9" y="10.8" width="6" height="4.6" rx="1.4"/><path d="M10.3 10.8V9.9a1.7 1.7 0 0 1 3.4 0v.9"/>`,
  eye: `<path d="M2.9 12S6.1 5.9 12 5.9 21.1 12 21.1 12 17.9 18.1 12 18.1 2.9 12 2.9 12z"/><circle cx="12" cy="12" r="2.8"/>`,
  scope: `<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.3"/><path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3"/>`,
  scribe: `<path d="M5 6.4h8M5 10.8h5M5 15.2h4"/><path d="m14.6 18.8 5-5a1.6 1.6 0 0 0-2.3-2.3l-5 5-.7 3.3z"/>`,
  terminal: `<rect x="3.4" y="5" width="17.2" height="14" rx="3.4"/><path d="m7.8 10 3 2.1-3 2.1M13 14.4h3.4"/>`,
  cpu: `<rect x="6.5" y="6.5" width="11" height="11" rx="3.2"/><rect x="9.9" y="9.9" width="4.2" height="4.2" rx="1.3"/><path d="M9.6 3.6v2.9M14.4 3.6v2.9M9.6 17.5v2.9M14.4 17.5v2.9M3.6 9.6h2.9M3.6 14.4h2.9M17.5 9.6h2.9M17.5 14.4h2.9"/>`,
  cube: `<path d="M12 3.3 19.4 7.5v9L12 20.7 4.6 16.5v-9z"/><path d="M4.9 7.7 12 12l7.1-4.3M12 12v8.4"/>`,
  server: `<rect x="3.8" y="4" width="16.4" height="6.6" rx="2.3"/><rect x="3.8" y="13.4" width="16.4" height="6.6" rx="2.3"/><path d="M7.6 7.3h.01M7.6 16.7h.01"/>`,
  network: `<circle cx="12" cy="5.8" r="2.2"/><circle cx="5.6" cy="18" r="2.2"/><circle cx="18.4" cy="18" r="2.2"/><path d="M12 8v3.2M12 11.2l-5 5M12 11.2l5 5"/>`,
  key: `<circle cx="7.8" cy="12" r="3.6"/><path d="M11.4 12H20.4M17.4 12v3M20.4 12v2"/>`,
  pause: `<rect x="6.4" y="4.8" width="3.9" height="14.4" rx="1.5"/><rect x="13.7" y="4.8" width="3.9" height="14.4" rx="1.5"/>`,
  memory: `<rect x="3.4" y="6" width="17.2" height="9.6" rx="2.4"/><path d="M7.2 10v1.6M10.4 10v1.6M13.6 10v1.6M16.8 10v1.6M7.4 15.6v3M11 15.6v3M14.6 15.6v3"/>`,
  arrows: `<path d="M4.2 8H17M13.6 4.6 17 8l-3.4 3.4M19.8 16H7M10.4 12.6 7 16l3.4 3.4"/>`,
  file: `<path d="M7.2 3.6h6.6L18.6 8.4v10.2a1.8 1.8 0 0 1-1.8 1.8H7.2a1.8 1.8 0 0 1-1.8-1.8V5.4a1.8 1.8 0 0 1 1.8-1.8z"/><path d="M13.6 3.9v4.3a.5.5 0 0 0 .5.5h4.3"/>`,
  signal: `<path d="M3.5 12h3l2.4-6 3.6 12 2.6-8 1.6 2h3.8"/>`,
  blast: `<circle cx="12" cy="12" r="2.2"/><circle cx="12" cy="12" r="5.6"/><circle cx="12" cy="12" r="9"/>`,
  info: `<circle cx="12" cy="12" r="8.6"/><path d="M12 11.2v5M12 7.9h.01"/>`,
  clock: `<circle cx="12" cy="12" r="8.6"/><path d="M12 7.4V12l3.2 1.9"/>`,
  x: `<path d="m6.6 6.6 10.8 10.8M17.4 6.6 6.6 17.4"/>`,
  reset: `<path d="M4.6 12a7.4 7.4 0 1 0 2.2-5.3"/><path d="M4.6 4.6v4h4"/>`,
  play: `<path d="M8.2 5.6v12.8l10-6.4z"/>`,
  bolt: `<path d="M13.2 3 5.6 13.3h5.3L10.2 21l7.6-10.3h-5.3z"/>`,
  expand: `<path d="M14.2 4H20v5.8M9.8 20H4v-5.8M19.6 4.4l-6 6M4.4 19.6l6-6"/>`,
  collapse: `<path d="M19.6 4.4l-6 6M4.4 19.6l6-6M13.8 10.2V5M13.8 10.2H19M10.2 13.8V19M10.2 13.8H5"/>`,
  building: `<rect x="4.4" y="3.6" width="9.2" height="16.8" rx="2"/><path d="M13.6 9.6h4a2 2 0 0 1 2 2v8.8h-6M7.8 8h2.4M7.8 11.6h2.4M7.8 15.2h2.4"/>`,
  database: `<ellipse cx="12" cy="6.2" rx="7" ry="2.8"/><path d="M5 6.2v11.6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6.2M5 12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8"/>`,
  person: `<circle cx="12" cy="8.4" r="3.6"/><path d="M5 19.6c.9-3.4 3.5-5.2 7-5.2s6.1 1.8 7 5.2"/>`,
};

export function icon(name: string, cls = "ico"): string {
  const d = P[name] ?? P.info;
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}
export const chev = () => icon("chevron", "chev");

export const AGENT_ICON: Record<string, string> = {
  sentry: "eye",
  triage: "scope",
  warden: "shieldLock",
  scribe: "scribe",
};
