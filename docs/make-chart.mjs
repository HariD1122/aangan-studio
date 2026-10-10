// Generates the component chart.
//   node docs/make-chart.mjs public    -> docs/component-chart.svg/.html   (safe to commit: NO passwords)
//   CHART_ADMIN=... CHART_DESIGNER=... CHART_PASSWORD=... node docs/make-chart.mjs private   -> private/ (git-ignored: has the logins; never commit)
// Render to PNG with headless Chrome:
//   chrome --headless=new --screenshot=<out.png> --window-size=1900,<height> --hide-scrollbars <file.html>
import fs from "node:fs";

const MODE = process.argv[2] === "private" ? "private" : "public";
const SITE = "https://aangan-studio-azure.vercel.app/login";

const COLS = ["Trigger", "Input", "Context", "Processing", "AI", "Output"];
const ROWS = [
  { name: "Customer", sub: "Phone call", tint: "#eaf1fd" },
  { name: "Phone AI", sub: "App: VaaniVoice AI", tint: "#fff8e1" },
  { name: "The App", sub: "Apps: Vercel + Neon", tint: "#eaf6ec" },
  { name: "AI Model", sub: "App: Google Gemini", tint: "#fde9f1" },
  { name: "HubSpot", sub: "App: HubSpot CRM", tint: "#eef0fb" },
  { name: "Telegram", sub: "App: Telegram bot", tint: "#e6f6f8" },
  { name: "Studio Team", sub: "Admin + Designers", tint: "#fff3e6" },
  { name: "CEO / Board", sub: "View only", tint: "#f1ecf8" },
];
const KIND = {
  trigger: ["#ece9fb", "#5b4fcf"], input: ["#e3effd", "#3b82f6"], context: ["#e4f6e8", "#2e9e4f"],
  process: ["#fff0d6", "#f08c00"], ai: ["#fde1ee", "#e0399b"], output: ["#ffe6e3", "#e5483b"],
};

const W = 1900, LEFT = 190, MARG = 24, HDR = 56, TITLE = 92, ROWH = 134, FOOT = 330;
const CW = (W - LEFT - MARG * 2) / COLS.length;
const H = TITLE + HDR + ROWS.length * ROWH + FOOT;
const BW = 240, BH = 108;

const colX = (c) => MARG + LEFT + c * CW;
const rowY = (r) => TITLE + HDR + r * ROWH;
const box = (id, r, c, kind, app, text) => ({ id, r, c, kind, app, text, x: colX(c) + (CW - BW) / 2, y: rowY(r) + (ROWH - BH) / 2 });

const B = Object.fromEntries([
  box("A", 0, 0, "trigger", "Customer's phone", "Customer phones the studio's number"),
  box("B", 0, 1, "input", "VaaniVoice AI", "Tells the AI about the project: place, size, timeline, budget"),
  box("C", 1, 2, "context", "VaaniVoice AI", "AI's script: our services, areas we serve, never quotes prices"),
  box("D", 1, 3, "process", "VaaniVoice AI", "AI receptionist answers, asks questions and records the call"),
  box("E", 2, 3, "process", "Aangan app on Vercel", "App receives the call report, ignores duplicates, saves it"),
  box("F", 3, 2, "context", "Aangan app", "Owner's checklist: real project? Pune / PCMC? realistic timeline? decision-maker?"),
  box("G", 3, 4, "ai", "Google Gemini", "Writes 5 short notes + key details and judges the fit"),
  box("H", 2, 5, "output", "Neon database", "Lead created in the app with notes and full transcript"),
  box("K", 4, 3, "process", "HubSpot", "Client, designer and status are sent to HubSpot automatically (one way)"),
  box("L", 4, 5, "output", "HubSpot", "Admin types the quote, final budget and Won / Lost in HubSpot"),
  box("M", 5, 3, "process", "Telegram", "App posts a 'New lead' alert (no phone numbers)"),
  box("N", 5, 5, "output", "Telegram", "Team sees the alert on their phones"),
  box("I", 6, 3, "process", "Aangan app on Vercel", "Admin reads the notes, assigns a designer, asks for meetings / tasks"),
  box("J", 6, 5, "output", "Aangan app on Vercel", "Designer accepts or rejects (with a reason). Accepted meetings show on the calendar"),
  box("O", 7, 5, "output", "Aangan app (Summary page)", "CEO sees leads, revenue and quotes, live from HubSpot"),
].map((b) => [b.id, b]));

const right = (b) => [b.x + BW, b.y + BH / 2], left = (b) => [b.x, b.y + BH / 2];
const top = (b) => [b.x + BW / 2, b.y], bottom = (b) => [b.x + BW / 2, b.y + BH];
const P = (pts) => "M" + pts.map((p) => p.join(" ")).join(" L");
const busX = colX(3) + (CW - BW) / 2 - 22;
const gutterX = W - MARG - 8;
const gapY = (r) => rowY(r) - 5;

const arrows = [
  P([right(B.A), left(B.B)]),
  P([right(B.B), [top(B.D)[0], right(B.B)[1]], top(B.D)]),
  P([right(B.C), left(B.D)]),
  P([bottom(B.D), top(B.E)]),
  P([right(B.E), [top(B.G)[0], right(B.E)[1]], top(B.G)]),
  P([right(B.F), left(B.G)]),
  P([right(B.G), [right(B.G)[0] + 12, right(B.G)[1]], [right(B.G)[0] + 12, left(B.H)[1]], left(B.H)]),
  P([bottom(B.H), [bottom(B.H)[0], gapY(4)], [busX, gapY(4)], [busX, left(B.K)[1]], left(B.K)]),
  P([[busX, left(B.K)[1]], [busX, left(B.M)[1]], left(B.M)]),
  P([[busX, left(B.M)[1]], [busX, left(B.I)[1]], left(B.I)]),
  P([right(B.K), left(B.L)]),
  P([right(B.M), left(B.N)]),
  P([right(B.I), left(B.J)]),
  P([right(B.L), [gutterX, right(B.L)[1]], [gutterX, right(B.O)[1]], right(B.O)]),
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const wrap = (t, n = 28) => {
  const out = []; let line = "";
  for (const w of t.split(" ")) { if ((line + " " + w).trim().length > n) { out.push(line.trim()); line = w; } else line += " " + w; }
  if (line.trim()) out.push(line.trim());
  return out;
};

let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Segoe UI, Arial, sans-serif">
<defs><marker id="ah" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="9" markerHeight="9" orient="auto"><path d="M1 1L9 5L2 9Z" fill="#1c2b4a"/></marker></defs>
<rect width="${W}" height="${H}" fill="#ffffff"/>
<text x="${W / 2}" y="46" text-anchor="middle" font-size="34" font-weight="700" fill="#14254a">Aangan Studio · From a Phone Call to a Closed Deal — Components Map</text>
<text x="${W / 2}" y="76" text-anchor="middle" font-size="17" fill="#55627a">Follow the dashed arrows: a customer calls, the AI listens, the app saves it, and the team and CEO see the result. The small label in each box is the application doing that step.</text>`;

svg += `<rect x="${MARG}" y="${TITLE}" width="${W - MARG * 2}" height="${HDR}" rx="10" fill="#14254a"/>`;
svg += `<text x="${MARG + LEFT / 2}" y="${TITLE + 35}" text-anchor="middle" font-size="19" font-weight="700" fill="#fff">Who</text>`;
COLS.forEach((c, i) => {
  svg += `<text x="${colX(i) + CW / 2}" y="${TITLE + 35}" text-anchor="middle" font-size="19" font-weight="700" fill="#fff">${c}</text>`;
  if (i) svg += `<line x1="${colX(i)}" y1="${TITLE + 8}" x2="${colX(i)}" y2="${TITLE + HDR - 8}" stroke="#3a4a6b"/>`;
});
ROWS.forEach((r, i) => {
  const y = rowY(i);
  svg += `<rect x="${MARG}" y="${y}" width="${W - MARG * 2}" height="${ROWH}" fill="${r.tint}"/>`;
  svg += `<rect x="${MARG}" y="${y + 2}" width="${LEFT}" height="${ROWH - 4}" rx="6" fill="#14254a"/>`;
  svg += `<text x="${MARG + LEFT / 2}" y="${y + ROWH / 2 - 2}" text-anchor="middle" font-size="19" font-weight="700" fill="#fff">${esc(r.name)}</text>`;
  svg += `<text x="${MARG + LEFT / 2}" y="${y + ROWH / 2 + 21}" text-anchor="middle" font-size="13.5" fill="#c3cde2">${esc(r.sub)}</text>`;
});
for (let c = 1; c < COLS.length; c++) svg += `<line x1="${colX(c)}" y1="${TITLE + HDR}" x2="${colX(c)}" y2="${TITLE + HDR + ROWS.length * ROWH}" stroke="#ffffff" stroke-width="2"/>`;

for (const d of arrows) svg += `<path d="${d}" fill="none" stroke="#1c2b4a" stroke-width="2" stroke-dasharray="7 5" marker-end="url(#ah)"/>`;
for (const b of Object.values(B)) {
  const [fill, stroke] = KIND[b.kind];
  const lines = wrap(b.text);
  svg += `<rect x="${b.x}" y="${b.y}" width="${BW}" height="${BH}" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
  svg += `<text x="${b.x + 12}" y="${b.y + 20}" font-size="12.5" font-weight="700" fill="${stroke}">${esc(b.app.toUpperCase())}</text>`;
  const y0 = b.y + 44 + (3 - Math.min(lines.length, 4)) * 5;
  lines.forEach((l, i) => { svg += `<text x="${b.x + BW / 2}" y="${y0 + i * 19}" text-anchor="middle" font-size="15" fill="#15233f">${esc(l)}</text>`; });
}

// legend
const ly = TITLE + HDR + ROWS.length * ROWH + 30;
let lx = MARG + 6;
for (const [k, label] of [["trigger", "What starts it"], ["input", "Information given"], ["context", "Rules and knowledge used"], ["process", "What the system does"], ["ai", "AI writes / decides"], ["output", "Result"]]) {
  const [fill, stroke] = KIND[k];
  svg += `<rect x="${lx}" y="${ly - 14}" width="26" height="18" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="2"/><text x="${lx + 34}" y="${ly}" font-size="15" fill="#15233f">${label}</text>`;
  lx += 34 + label.length * 8.6 + 34;
}

// panels: applications used + logins/access
const py = ly + 24, ph = 232, pw = (W - MARG * 2 - 24) / 2;
const panel = (x, title, rows, accent) => {
  let s = `<rect x="${x}" y="${py}" width="${pw}" height="${ph}" rx="12" fill="#f7f9fd" stroke="${accent}" stroke-width="2"/>`;
  s += `<text x="${x + 20}" y="${py + 32}" font-size="20" font-weight="700" fill="#14254a">${esc(title)}</text>`;
  rows.forEach(([a, b], i) => {
    s += `<text x="${x + 20}" y="${py + 64 + i * 25}" font-size="15.5" font-weight="700" fill="#15233f">${esc(a)}</text>`;
    s += `<text x="${x + 215}" y="${py + 64 + i * 25}" font-size="15.5" fill="#33415c">${esc(b)}</text>`;
  });
  return s;
};
svg += panel(MARG, "Applications used", [
  ["VaaniVoice AI", "Answers the phone and records the call"],
  ["Google Gemini", "Writes the short notes and judges the fit"],
  ["Neon", "Database that stores every lead and call"],
  ["Vercel", "Runs the website live on the internet"],
  ["GitHub", "Keeps the program code safe (private)"],
  ["HubSpot", "Sales CRM: quotes, final budget, Won / Lost"],
  ["Telegram", "Sends 'new lead' alerts to the team group"],
], "#3b82f6");
svg += MODE === "private"
  ? panel(MARG + pw + 24, "Logins for the Aangan Studio app (keep this image private)", [
      ["Website", SITE.replace("https://", "")],
      ["Admin login", process.env.CHART_ADMIN ?? "(not provided)"],
      ["Designer login", process.env.CHART_DESIGNER ?? "(not provided)"],
      ["Password (both)", process.env.CHART_PASSWORD ?? "(not provided)"],
      ["Admin can", "assign designers, request meetings, see everything"],
      ["Designer can", "see own clients, accept or reject meetings and tasks"],
    ], "#e5483b")
  : panel(MARG + pw + 24, "Access to the Aangan Studio app", [
      ["Website", SITE.replace("https://", "")],
      ["Admin login", "Given to the owner separately"],
      ["Designer login", "Given to the owner separately"],
      ["Admin can", "assign designers, request meetings, see everything"],
      ["Designer can", "see own clients, accept or reject meetings and tasks"],
    ], "#2e9e4f");
svg += `<text x="${MARG + 6}" y="${py + ph + 30}" font-size="14.5" fill="#55627a">Tasks and meetings given to designers stay inside the app and are never sent to HubSpot. You can test the whole flow with the app's "Run a sample call" button, without a phone number.</text>`;
svg += `</svg>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Component chart</title><style>@page{size:${W}px ${H}px;margin:0}html,body{margin:0;background:#fff;overflow:hidden}svg{display:block}</style></head><body>${svg}</body></html>`;
const dir = MODE === "private" ? new URL("../private/", import.meta.url) : new URL("./", import.meta.url);
fs.mkdirSync(dir, { recursive: true });
const base = MODE === "private" ? "component-chart-with-logins" : "component-chart";
fs.writeFileSync(new URL(`./${base}.html`, dir), html);
fs.writeFileSync(new URL(`./${base}.svg`, dir), svg);
console.log(`${MODE} chart ${W}x${H}`);
