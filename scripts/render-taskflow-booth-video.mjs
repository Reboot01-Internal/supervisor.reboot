import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";

const W = 1920;
const H = 1080;
const FPS = 24;
const OUT_FPS = 60;
const DURATION = 48;
const TOTAL = FPS * DURATION;
const outDir = path.resolve("artifacts");
const outFile = path.join(outDir, "taskflow-booth-showcase.mp4");

fs.mkdirSync(outDir, { recursive: true });

const purple = "#6F5BFF";
const cyan = "#3CC1C0";
const ink = "#0f172a";
const muted = "#64748b";
const bg = "#F5F7FB";

const scenes = [
  { name: "intro", start: 0, dur: 4 },
  { name: "dashboard", start: 4, dur: 5 },
  { name: "users", start: 9, dur: 5 },
  { name: "boards", start: 14, dur: 6 },
  { name: "discord", start: 20, dur: 6 },
  { name: "tasks", start: 26, dur: 7 },
  { name: "meetings", start: 33, dur: 5 },
  { name: "reports", start: 38, dur: 6 },
  { name: "ending", start: 44, dur: 4 },
];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => 0.5 - Math.cos(Math.PI * clamp(t)) / 2;
const out = (t) => 1 - Math.pow(1 - clamp(t), 3);
const inout = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

function currentScene(t) {
  return scenes.find((s) => t >= s.start && t < s.start + s.dur) ?? scenes[scenes.length - 1];
}

function rounded(x, y, w, h, r = 24, fill = "#fff", stroke = "#dbe4f0", opacity = 1, extra = "") {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" opacity="${opacity}" ${extra}/>`;
}

function text(x, y, value, size = 32, weight = 700, fill = ink, anchor = "start", extra = "") {
  return `<text x="${x}" y="${y}" font-family="Inter, SF Pro Display, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" letter-spacing="0" ${extra}>${esc(value)}</text>`;
}

function pill(x, y, label, color = purple, w = null) {
  const width = w ?? Math.max(96, label.length * 12 + 34);
  return `${rounded(x, y, width, 38, 19, `${color}14`, `${color}55`)}${text(x + width / 2, y + 25, label, 18, 700, color, "middle")}`;
}

function iconCircle(x, y, color = purple, label = "") {
  return `<g filter="url(#softShadow)">${rounded(x, y, 58, 58, 20, `${color}16`, `${color}55`)}${text(x + 29, y + 38, label, 24, 800, color, "middle")}</g>`;
}

function particles(t) {
  let s = "";
  for (let i = 0; i < 72; i++) {
    const x = (i * 157 + Math.sin(t * 0.18 + i) * 24) % W;
    const y = (i * 89 + Math.cos(t * 0.13 + i * 0.7) * 18) % H;
    const a = 0.16 + 0.16 * Math.sin(t * 0.8 + i);
    const c = i % 3 === 0 ? purple : i % 3 === 1 ? cyan : "#ffffff";
    s += `<circle cx="${x}" cy="${y}" r="${1.2 + (i % 4) * 0.55}" fill="${c}" opacity="${clamp(a)}"/>`;
  }
  return s;
}

function background(t) {
  return `
    <rect width="${W}" height="${H}" fill="${bg}"/>
    <rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.42"/>
    <circle cx="${260 + Math.sin(t * 0.2) * 24}" cy="${80}" r="360" fill="${purple}" opacity="0.15" filter="url(#blur60)"/>
    <circle cx="${1660 + Math.cos(t * 0.18) * 30}" cy="${920}" r="390" fill="${cyan}" opacity="0.13" filter="url(#blur60)"/>
    <circle cx="${980}" cy="${190 + Math.sin(t * 0.16) * 26}" r="260" fill="#ffffff" opacity="0.55" filter="url(#blur60)"/>
    ${particles(t)}
  `;
}

function aiOrb(t, sceneName, p) {
  const map = {
    intro: [480, 760],
    dashboard: [1370, 250],
    users: [1510, 345],
    boards: [1390, 640],
    discord: [350, 835],
    tasks: [1440, 545],
    meetings: [1390, 265],
    reports: [735, 465],
    ending: [960, 500],
  };
  const [tx, ty] = map[sceneName] ?? [960, 540];
  const bob = Math.sin(t * 2.2) * 9;
  const blink = Math.sin(t * 5.7) > 0.95 ? 2 : 8;
  return `
    <g transform="translate(${tx},${ty + bob})" filter="url(#glow)">
      <circle cx="0" cy="0" r="52" fill="url(#orb)"/>
      <circle cx="-17" cy="-7" r="6" fill="#111827" opacity="0.82"/>
      <rect x="12" y="${-7 - blink / 2}" width="12" height="${blink}" rx="${blink / 2}" fill="#111827" opacity="0.82"/>
      <path d="M-20 17 Q0 31 22 17" fill="none" stroke="#111827" stroke-width="5" stroke-linecap="round" opacity="0.6"/>
      <circle cx="-42" cy="38" r="5" fill="${cyan}" opacity="0.75"/>
      <circle cx="-65" cy="55" r="3" fill="${purple}" opacity="0.45"/>
    </g>
  `;
}

function label(x, y, value) {
  return `<g filter="url(#softShadow)">${rounded(x, y, value.length * 13 + 44, 46, 23, "#ffffffdd", "#dbe4f0")}${text(x + 22, y + 30, value, 18, 800, ink)}</g>`;
}

function shell(active, titleValue, subValue, body, p, opts = {}) {
  const scale = opts.scale ?? 1;
  const dx = opts.dx ?? 0;
  const dy = opts.dy ?? 0;
  const nav = ["Dashboard", "Boards", "Users", "Meetings", "Notifications", "Reports"];
  const items = nav.map((n, i) => {
    const y = 150 + i * 78;
    const activeBg = n === active ? `${purple}13` : "#fff";
    const activeStroke = n === active ? `${purple}55` : "#dbe4f0";
    return `<g>${rounded(34, y, 248, 56, 19, activeBg, activeStroke)}${iconCircle(52, y + 9, n === active ? purple : "#94a3b8", n[0])}${text(104, y + 36, n, 20, 600, n === active ? ink : "#334155")}</g>`;
  }).join("");
  return `
    <g transform="translate(${dx},${dy}) scale(${scale})">
      ${rounded(24, 30, 276, 1000, 28, "#ffffffee", "#d7e2ef")}
      <circle cx="78" cy="84" r="33" fill="${cyan}" opacity="0.9"/>
      ${text(116, 80, "TaskFlow", 24, 800)}
      ${text(116, 112, "Admin Console", 16, 700, muted)}
      ${nav ? items : ""}
      <line x1="48" y1="810" x2="276" y2="810" stroke="#dbe4f0"/>
      ${rounded(40, 830, 236, 62, 18, "#fff", "#dbe4f0")}
      ${text(96, 870, "Reem Alhalwachi", 17, 800)}
      ${text(96, 896, "System access", 14, 700, muted)}
      <circle cx="67" cy="862" r="24" fill="#e2e8f0"/>
      ${text(67, 871, "R", 24, 800, purple, "middle")}
      ${text(340, 72, "Welcome back", 18, 800, muted)}
      ${text(340, 124, titleValue, 38, 850)}
      ${text(340, 164, subValue, 19, 800, muted)}
      ${body}
    </g>
  `;
}

function miniChart(x, y, pct, color = purple) {
  const r = 102;
  const c = 2 * Math.PI * r;
  const dash = c * clamp(pct);
  return `
    <g transform="translate(${x},${y})">
      <circle cx="0" cy="0" r="${r}" fill="none" stroke="#e9eef6" stroke-width="34"/>
      <circle cx="0" cy="0" r="${r}" fill="none" stroke="${color}" stroke-width="34" stroke-linecap="round"
        stroke-dasharray="${dash} ${c - dash}" transform="rotate(-90)" filter="url(#tinyGlow)"/>
      ${text(0, 13, `${Math.round(pct * 100)}%`, 54, 850, ink, "middle")}
      ${text(0, 54, "COMPLETE", 16, 800, "#94a3b8", "middle")}
    </g>
  `;
}

function bars(x, y, p, colors = [purple, "#ffb000", "#ef4444", cyan]) {
  const labels = ["Medium", "High", "Urgent", "Low"];
  return labels.map((l, i) => {
    const w = [380, 150, 70, 42][i] * clamp(p * (1.2 - i * 0.08));
    return `<g>${text(x, y + i * 56, l, 18, 800, colors[i])}<rect x="${x}" y="${y + 16 + i * 56}" width="400" height="13" rx="7" fill="#eef3fa"/><rect x="${x}" y="${y + 16 + i * 56}" width="${w}" height="13" rx="7" fill="${colors[i]}"/></g>`;
  }).join("");
}

function sceneIntro(t, p) {
  const z = lerp(0.94, 1.01, ease(p));
  return `
    <g transform="translate(${lerp(0, -20, p)}, ${lerp(18, 0, ease(p))}) scale(${z})" opacity="${ease(p / 0.45)}">
      ${rounded(248, 132, 1424, 804, 34, "#ffffff", "#dde6f1", 1, 'filter="url(#bigShadow)"')}
      <clipPath id="loginClip"><rect x="248" y="132" width="810" height="804" rx="34"/></clipPath>
      <g clip-path="url(#loginClip)">
        <rect x="248" y="132" width="810" height="804" fill="#1f2937"/>
        <rect x="248" y="132" width="810" height="804" fill="url(#photoLike)" opacity="0.85"/>
        <rect x="248" y="132" width="810" height="804" fill="#111827" opacity="0.32"/>
        ${text(300, 220, "reboot", 24, 850, "#fff")}
        ${text(300, 790, "Welcome to", 24, 850, "#fff")}
        ${text(300, 860, "TaskFlow", 48, 850, "#fff")}
      </g>
      ${text(1130, 410, "Sign In", 44, 850)}
      ${text(1130, 456, "Enter your nickname or email to continue.", 20, 800, muted)}
      ${rounded(1130, 500, 455, 60, 14, "#edf4ff", "#d7e2ef")}${text(1152, 539, "ralhalwa", 19, 600)}
      ${rounded(1130, 580, 455, 60, 14, "#edf4ff", "#d7e2ef")}${text(1152, 619, "••••••••••••", 19, 700)}
      ${rounded(1130, 665, 455, 62, 14, purple, purple)}${text(1358, 706, "Sign In", 20, 700, "#fff", "middle")}
    </g>
    ${text(960, 132, "TaskFlow", 58, 850, ink, "middle", `opacity="${clamp((p - 0.12) / 0.5)}"`)}
    ${text(960, 188, "Intelligent Supervision Platform", 24, 800, muted, "middle", `opacity="${clamp((p - 0.18) / 0.5)}"`)}
    ${label(430, 742, "Welcome back.")}
  `;
}

function sceneDashboard(t, p) {
  const ep = ease(p);
  const stat = (x, y, title, value, col, icon) => `${rounded(x, y, 360, 110, 22, "#fff", "#dbe4f0", 1, 'filter="url(#softShadow)"')}${text(x + 28, y + 38, title, 16, 800, muted)}${text(x + 28, y + 82, Math.round(value * ep), 34, 850)}${iconCircle(x + 284, y + 24, col, icon)}`;
  const body = `
    ${stat(340, 190, "Supervisors", 13, "#2563eb", "S")}
    ${stat(720, 190, "Talents", 100, "#10b981", "T")}
    ${stat(1100, 190, "Boards", 71, purple, "B")}
    ${stat(1480, 190, "Cards", 156, "#f59e0b", "C")}
    ${rounded(340, 330, 640, 560, 24, "#fff", "#dbe4f0", 1, 'filter="url(#softShadow)"')}
    ${text(370, 372, "Supervisor Activity", 16, 800, muted)}${text(370, 414, "This week", 26, 850)}
    ${miniChart(650, 650, 0.23 * ep, "#22c55e")}
    ${rounded(1010, 330, 850, 560, 24, "#fff", "#dbe4f0", 1, 'filter="url(#softShadow)"')}
    ${text(1040, 372, "Task Completion", 16, 800, muted)}${text(1040, 414, "Tasks and subtasks", 26, 850)}
    ${stat(1040, 460, "Tasks", 156, "#2563eb", "C")}
    ${stat(1430, 460, "Subtasks", 287, purple, "L")}
    ${stat(1040, 600, "On time", 393, "#10b981", "•")}
    ${stat(1430, 600, "Overdue", 50, "#e11d48", "!")}
    <rect x="1040" y="808" width="760" height="16" rx="8" fill="#eef3fa"/>
    <rect x="1040" y="808" width="${760 * ep * 0.89}" height="16" rx="8" fill="url(#lineGrad)"/>
    ${label(1120, 230, "Track Performance")}
    ${label(1290, 832, "Manage Projects")}
  `;
  return shell("Dashboard", "Admin Dashboard", "Manage users and supervise the system.", body, p, { dx: lerp(30, 0, ep) });
}

function sceneUsers(t, p) {
  const ep = ease(p);
  const users = ["Abdelrahman Ahmed", "Abdul Aziz Bin Rajab", "Abdulla Abd", "Abdulla Alasmawi", "Ali Khalaf", "Noora Qasim"];
  const cards = users.map((u, i) => {
    const x = 360 + (i % 2) * 760;
    const y = 380 + Math.floor(i / 2) * 116 + lerp(40, 0, clamp(ep * 1.3 - i * 0.08));
    const role = i === 0 ? "Supervisor" : "Talent";
    return `<g opacity="${clamp(ep * 1.5 - i * 0.08)}">${rounded(x, y, 720, 96, 18, "#fff", "#dbe4f0")}${text(x + 90, y + 42, u, 20, 850)}${text(x + 90, y + 68, "@" + u.split(" ")[0].toLowerCase(), 15, 800, purple)}<circle cx="${x + 48}" cy="${y + 48}" r="28" fill="#e2e8f0"/><text x="${x + 48}" y="${y + 58}" font-size="22" font-family="Arial" font-weight="800" text-anchor="middle" fill="${purple}">${u[0]}</text>${pill(x + 220, y + 54, role, role === "Talent" ? "#10b981" : purple, 110)}${pill(x + 345, y + 54, "Cohort " + ((i % 3) + 1), "#64748b", 110)}</g>`;
  }).join("");
  const body = `
    ${rounded(340, 190, 1520, 118, 24, "#fff", "#dbe4f0")}
    ${rounded(362, 212, 880, 56, 16, "#f8fafc", "#dbe4f0")}${text(388, 248, "Search by name, email, or nickname...", 22, 500, "#94a3b8")}
    ${rounded(1260, 212, 190, 56, 16, "#f8fafc", "#dbe4f0")}${text(1290, 248, "All", 20, 500)}
    ${rounded(1466, 212, 250, 56, 16, "#f8fafc", "#dbe4f0")}${text(1496, 248, "All cohorts", 20, 500)}
    ${pill(1488, 72, "Create users", purple, 178)}${pill(1680, 72, "Assign Talents", purple, 200)}
    ${rounded(360, 318, 500, 58, 16, "#fff6f7", "#ffb2c3")}${text(408, 356, "Select users to delete", 20, 700, "#e11d48")}
    ${cards}
    ${label(1010, 840, "Organize supervisors and talents instantly")}
  `;
  return shell("Users", "Users", "Browse users and build a clean create queue from Reboot.", body, p);
}

function sceneBoards(t, p) {
  const ep = ease(p);
  const modal = clamp((p - 0.25) / 0.45);
  const created = clamp((p - 0.72) / 0.22);
  const boardCard = (x, y, name, active = false) => `${rounded(x, y, 500, 285, 24, "#fff", active ? `${cyan}aa` : "#dbe4f0", 1, 'filter="url(#softShadow)"')}${iconCircle(x + 24, y + 26, purple, "B")}${text(x + 90, y + 64, name, 24, 850)}${pill(x + 28, y + 94, active ? "Reem Alhalwachi" : "Nooh Shamlan", purple, 190)}${pill(x + 230, y + 94, "20 May 2026", "#64748b", 142)}<circle cx="${x + 62}" cy="${y + 164}" r="24" fill="#e2e8f0"/><circle cx="${x + 88}" cy="${y + 164}" r="24" fill="#c4b5fd"/><rect x="${x + 30}" y="${y + 230}" width="118" height="38" rx="19" fill="#f8fafc" stroke="#dbe4f0"/><text x="${x + 88}" y="${y + 255}" font-size="16" font-family="Arial" font-weight="800" text-anchor="middle" fill="${ink}">${active ? 1 : 0} Lists</text><rect x="${x + 166}" y="${y + 230}" width="118" height="38" rx="19" fill="#f8fafc" stroke="#dbe4f0"/><text x="${x + 224}" y="${y + 255}" font-size="16" font-family="Arial" font-weight="800" text-anchor="middle" fill="${ink}">${active ? 1 : 0} Cards</text>${text(x + 360, y + 255, "Open board ›", 17, 800, muted)}`;
  const body = `
    ${pill(1680, 72, "Create board", purple, 182)}
    ${rounded(340, 190, 615, 66, 20, "#fff", "#dbe4f0")}${text(388, 232, "Search boards, supervisors, cohorts...", 20, 800, "#94a3b8")}
    ${pill(1180, 202, "Boards", purple, 130)}${pill(1322, 202, "Lists", "#64748b", 120)}
    ${boardCard(340 + lerp(60, 0, ep), 300, created ? "ralhalwa-filler-1" : "nshamlan-rt-3", created > 0.1)}
    ${boardCard(880, 300, "nshamlan-rt-2")}
    ${boardCard(1420, 300, "nshamlan-rt-1")}
    ${boardCard(340, 620, "test222")}
    ${boardCard(880, 620, "yalmasri-smart-road-1")}
    <g opacity="${ease(modal)}" transform="translate(0,${lerp(28,0,ease(modal))})">
      <rect width="${W}" height="${H}" fill="#0f172a" opacity="${0.34 * ease(modal)}"/>
      ${rounded(470, 118, 980, 760, 28, "#ffffff", "#dbe4f0", 1, 'filter="url(#bigShadow)"')}
      ${text(500, 166, "Create board", 22, 850)}
      ${text(530, 250, "Board details", 24, 850)}
      ${text(530, 312, "SUPERVISOR", 16, 850, muted)}${rounded(530, 330, 520, 58, 16, "#f8fafc", "#dbe4f0")}${text(554, 368, "Reem Alhalwachi (@ralhalwa)", 21, 500)}
      ${text(530, 438, "BOARD NAME", 16, 850, muted)}${rounded(530, 456, 520, 58, 16, "#f8fafc", "#dbe4f0")}${text(554, 494, "ralhalwa-filler-1", 21, 500)}
      ${text(1080, 250, "Board members", 24, 850)}${pill(1320, 230, "1 selected", "#64748b", 118)}
      ${rounded(1080, 314, 520, 120, 20, "#f0fdf7", "#86efac")}${text(1200, 354, "Ali Khalaf", 22, 850)}${pill(1200, 374, "Cohort 3", "#64748b", 112)}<circle cx="1140" cy="374" r="29" fill="#e2e8f0"/>${text(1140, 384, "A", 22, 850, purple, "middle")}
      ${rounded(1260, 798, 160, 58, 18, purple, purple)}${text(1340, 836, "Create board", 20, 700, "#fff", "middle")}
    </g>
    ${label(1030, 890, "Every board creates a connected workspace")}
  `;
  return shell("Boards", "Boards", "All boards across supervisors", body, p);
}

function discordUI(t, p) {
  const ep = ease(p);
  const msg2 = clamp((p - 0.42) / 0.2);
  const pin = clamp((p - 0.65) / 0.2);
  return `
    <rect width="${W}" height="${H}" fill="#18191f"/>
    <rect x="0" y="0" width="${W}" height="78" fill="#111217" stroke="#2b2d34"/>
    ${text(78, 50, "# ralhalwa-filler-1", 28, 850, "#fff")}
    <rect x="1450" y="14" width="410" height="52" rx="14" fill="#111217" stroke="#363943"/>
    ${text(1470, 49, "Search Reboot01 - Cohort", 20, 700, "#8b8d98")}
    <rect x="1450" y="78" width="470" height="1002" fill="#1f2027" stroke="#2b2d34"/>
    ${text(1480, 135, "Staff — 2", 22, 850, "#8b8d98")}
    ${text(1560, 195, "Ahmed Al Jamal", 24, 700, "#d946ef")}<circle cx="1520" cy="185" r="28" fill="#2f3138"/><circle cx="1542" cy="207" r="9" fill="#43b581"/>
    ${text(1560, 270, "Reem Alhalwachi (ralhal...)", 24, 700, "#d946ef")}<circle cx="1520" cy="260" r="28" fill="#5865f2"/><circle cx="1542" cy="282" r="9" fill="#43b581"/>
    ${text(1480, 360, "Audit Mentor — 1", 22, 850, "#8b8d98")}
    ${text(1560, 420, "Ali Khalaf (ak1)", 24, 700, "#ef4444")}<circle cx="1520" cy="410" r="28" fill="#2f3138"/>
    ${text(36, 615, "Welcome to #ralhalwa-filler-1!", 52, 850, "#fff")}
    ${text(36, 675, "This is the start of the #ralhalwa-filler-1 private channel.", 26, 500, "#fff")}
    <line x1="36" y1="825" x2="1400" y2="825" stroke="#e11d48" opacity="0.65"/>
    <g transform="translate(36,855)" opacity="${ep}">
      <circle cx="36" cy="36" r="36" fill="${purple}"/>
      ${text(95, 28, "BoardFlow Bot", 26, 850, "#fff")} ${pill(274, 4, "APP", "#5865f2", 64)}
      ${text(95, 68, "@Reem Alhalwachi (ralhalwa) assigned @Ali Khalaf (ak1) to Login Page in ralhalwa-filler-1.", 24, 500, "#fff")}
      ${text(95, 104, "Deadline: 2026-05-28.", 24, 500, "#fff")}
    </g>
    <g transform="translate(36,980)" opacity="${ease(msg2)}">
      <circle cx="36" cy="36" r="36" fill="${purple}"/>
      ${text(95, 28, "BoardFlow Bot", 26, 850, "#fff")} ${pill(274, 4, "APP", "#5865f2", 64)}
      ${text(95, 68, "@Reem Alhalwachi booked a new meeting for test in ralhalwa-filler-1.", 24, 500, "#fff")}
    </g>
    <g opacity="${ease(pin)}" transform="translate(720,90) scale(${lerp(0.92,1,ease(pin))})">
      ${rounded(0, 0, 720, 360, 20, "#25262e", "#3a3c46", 1, 'filter="url(#bigShadow)"')}
      ${text(48, 60, "Pinned Messages", 36, 850, "#fff")}
      ${rounded(42, 112, 638, 210, 16, "#2f3038", "#454851")}
      ${text(170, 168, "BoardFlow Bot", 24, 850, "#fff")}
      ${text(170, 212, "@Reem Alhalwachi booked a new meeting", 24, 500, "#fff")}
      ${text(170, 252, "Location: Online", 24, 700, "#fff")}
      ${text(170, 292, "Time: 29 May 2026 10:00 AM - 11:00 AM", 22, 500, "#fff")}
      <circle cx="96" cy="210" r="38" fill="${purple}"/>
    </g>
    ${label(830, 735, "Real-time collaboration powered by Discord")}
  `;
}

function sceneTasks(t, p) {
  const ep = ease(p);
  const modal = clamp((p - 0.22) / 0.28);
  const yCard = lerp(500, 570, clamp((p - 0.08) / 0.24));
  const body = `
    ${pill(360, 206, "1 Lists", purple, 100)}${pill(480, 206, "1 Cards", "#64748b", 112)}${pill(610, 206, "0 Done", "#10b981", 116)}${pill(745, 206, "0 Overdue", "#e11d48", 130)}
    ${rounded(340, 260, 1520, 76, 24, "#fff", "#dbe4f0")}${rounded(1780, 276, 58, 52, 18, purple, purple)}${text(1809, 311, "+", 26, 500, "#fff", "middle")}
    ${rounded(340, 370, 1520, 520, 24, "#f8fbff", "#dbe4f0")}
    ${rounded(365, 405, 420, 300, 22, "#eef5fb", "#dbe4f0", 1, 'filter="url(#softShadow)"')}
    ${text(392, 452, "week1", 22, 500)}${pill(590, 420, "+ Add card", "#64748b", 150)}
    <g transform="translate(${lerp(398, 460, ep)}, ${yCard})" filter="url(#softShadow)">
      ${rounded(0, 0, 345, 190, 18, "#fff", "#dbe4f0")}
      ${text(82, 48, "Login Page", 22, 850)}
      ${pill(82, 72, "Mark done", "#64748b", 138)}${pill(230, 72, "High", "#f59e0b", 72)}
      ${pill(82, 122, "2026-05-28", "#64748b", 144)}
      <circle cx="300" cy="130" r="24" fill="#e2e8f0"/>
    </g>
    <g opacity="${ease(modal)}">
      <rect width="${W}" height="${H}" fill="#0f172a" opacity="${0.32 * ease(modal)}"/>
      ${rounded(470, 128, 980, 760, 28, "#fff", "#dbe4f0", 1, 'filter="url(#bigShadow)"')}
      ${text(500, 178, "Login Page", 22, 850)}
      ${rounded(505, 228, 380, 88, 16, "#f8fafc", "#dbe4f0")}${text(530, 266, "Title", 16, 850)}${text(530, 300, "Login Page", 22, 500)}
      ${rounded(900, 228, 260, 88, 16, "#fff7ed", "#fed7aa")}${text(925, 266, "Due date", 16, 850)}${text(925, 300, "28/05/2026", 22, 500)}
      ${rounded(505, 342, 655, 130, 16, "#f8fafc", "#dbe4f0")}${text(530, 382, "Priority", 16, 850)}${pill(965, 362, "High", "#f59e0b", 74)}
      ${rounded(505, 500, 655, 112, 16, "#f8fafc", "#dbe4f0")}${text(530, 542, "Assignees", 16, 850)}${pill(530, 562, "Ali Khalaf", purple, 130)}
      ${rounded(505, 640, 655, 112, 16, "#f8fafc", "#dbe4f0")}${text(530, 682, "Things to do", 16, 850)}<rect x="530" y="704" width="${440 * clamp((p - 0.5) / 0.22)}" height="16" rx="8" fill="${cyan}"/>
      ${rounded(1180, 228, 245, 46, 14, `${purple}18`, `${purple}66`)}${text(1303, 259, "Comments 0", 21, 500, ink, "middle")}
      ${rounded(1180, 294, 245, 90, 14, "#f8fafc", "#dbe4f0")}${text(1200, 348, "Write a comment...", 20, 500, "#94a3b8")}
      ${rounded(1270, 398, 150, 54, 14, "#64748b", "#64748b")}${text(1345, 433, "Add comment", 19, 600, "#fff", "middle")}
    </g>
    ${label(1120, 848, "Manage projects visually and efficiently")}
  `;
  return shell("Boards", "ralhalwa-filler-1", "Drag cards across lists. Double click a card to open.", body, p);
}

function sceneMeetings(t, p) {
  const ep = ease(p);
  const modal = clamp((p - 0.42) / 0.28);
  let days = "";
  for (let i = 0; i < 35; i++) {
    const x = 360 + (i % 7) * 135;
    const y = 405 + Math.floor(i / 7) * 112;
    const active = i === 25;
    days += `${rounded(x, y, 118, 90, 14, active ? "#fff8db" : "#f8fafc", active ? "#f59e0b" : "#dbe4f0")}${text(x + 16, y + 28, String(i < 5 ? 27 + i : i - 4), 18, 850)}<rect x="${x + 16}" y="${y + 68}" width="${30 * ((i % 3) + 1)}" height="8" rx="4" fill="${i % 2 ? "#10b981" : "#f59e0b"}" opacity="${ep}"/>`;
  }
  const body = `
    ${rounded(340, 190, 270, 58, 18, "#fff", "#dbe4f0")}${text(368, 227, "All supervisors", 20, 500)}
    ${rounded(625, 190, 270, 58, 18, "#fff", "#dbe4f0")}${text(653, 227, "All boards", 20, 500)}
    ${pill(1700, 72, "Book Meeting", "#f59e0b", 165)}
    ${rounded(340, 280, 970, 730, 24, "#fff", "#dbe4f0", 1, 'filter="url(#softShadow)"')}
    ${text(370, 340, "May 2026", 34, 850)}
    ${days}
    ${rounded(1340, 280, 520, 730, 24, "#fff", "#dbe4f0", 1, 'filter="url(#softShadow)"')}
    ${text(1370, 320, "SELECTED DAY", 16, 850, "#94a3b8")}${text(1370, 365, "Thursday 21 May", 28, 850)}
    ${rounded(1388, 400, 430, 236, 22, "#fff", "#dbe4f0", 1, 'stroke-dasharray="6 5"')}
    ${text(1600, 535, "No meetings on this day", 24, 850, muted, "middle")}
    <g opacity="${ease(modal)}">
      <rect width="${W}" height="${H}" fill="#0f172a" opacity="${0.34 * ease(modal)}"/>
      ${rounded(550, 80, 820, 920, 30, "#fff", "#dbe4f0", 1, 'filter="url(#bigShadow)"')}
      ${text(585, 145, "Book a meeting", 34, 850)}
      ${text(585, 198, "Room conflicts are blocked automatically and participants sync from the board.", 18, 800, muted)}
      ${text(585, 255, "SUPERVISOR", 16, 850, muted)}${rounded(585, 270, 360, 58, 16, "#f8fafc", "#dbe4f0")}${text(610, 308, "Reem Alhalwachi", 21, 500)}
      ${text(975, 255, "BOARD", 16, 850, muted)}${rounded(975, 270, 360, 58, 16, "#f8fafc", "#dbe4f0")}${text(1000, 308, "ralhalwa-filler-1", 21, 500)}
      ${text(585, 383, "MEETING TITLE", 16, 850, muted)}${rounded(585, 398, 360, 58, 16, "#f8fafc", "#dbe4f0")}${text(610, 436, "test", 21, 500)}
      ${text(975, 383, "DATE", 16, 850, muted)}${rounded(975, 398, 360, 58, 16, "#f8fafc", "#dbe4f0")}${text(1000, 436, "29/05/2026", 21, 500)}
      ${text(585, 510, "START TIME", 16, 850, muted)}${rounded(585, 526, 360, 58, 16, "#f8fafc", "#dbe4f0")}${text(610, 564, "10:00 am", 21, 500)}
      ${text(975, 510, "END TIME", 16, 850, muted)}${rounded(975, 526, 360, 58, 16, "#f8fafc", "#dbe4f0")}${text(1000, 564, "11:00 am", 21, 500)}
      ${rounded(1060, 900, 260, 64, 18, "#f59e0b", "#f59e0b")}${text(1190, 942, "Create meeting", 22, 700, "#fff", "middle")}
    </g>
    ${label(1220, 832, "Book meetings with automated reminders")}
  `;
  return shell("Meetings", "Meetings", "Track bookings, attendance, RSVP, and meeting outcomes.", body, p);
}

function sceneReports(t, p) {
  const ep = ease(p);
  const metric = (x, y, k, v, c = purple) => `${rounded(x, y, 250, 132, 22, `${c}08`, `${c}55`, 1, 'filter="url(#softShadow)"')}${text(x + 26, y + 38, k, 16, 850, muted)}${text(x + 26, y + 92, v, 38, 850)}`;
  const body = `
    ${metric(340, 190, "COMPLETION", `${Math.round(55 * ep)}%`, purple)}
    ${metric(610, 190, "OVERDUE", Math.round(49 * ep), "#ef4444")}
    ${metric(880, 190, "BOARDS", Math.round(72 * ep), "#64748b")}
    ${metric(1150, 190, "TALENTS", Math.round(100 * ep), cyan)}
    ${metric(1420, 190, "MEETINGS", Math.round(105 * ep), "#0ea5e9")}
    ${metric(1690, 190, "UPCOMING", Math.round(2 * ep), "#10b981")}
    ${rounded(340, 365, 780, 560, 24, "#fff", "#dbe4f0", 1, 'filter="url(#softShadow)"')}
    ${text(370, 410, "WORKSPACE", 16, 850, purple)}${text(370, 460, "Delivery health", 30, 850)}
    ${miniChart(525, 705, 0.55 * ep, purple)}
    ${rounded(700, 520, 360, 312, 22, "#f8fafc", "#dbe4f0")}${text(730, 560, "PRIORITY MIX", 16, 850, muted)}${bars(730, 610, ep)}
    ${rounded(1140, 365, 720, 560, 24, "#fff", "#dbe4f0", 1, 'filter="url(#softShadow)"')}
    ${text(1170, 410, "MEETINGS", 16, 850, purple)}${text(1170, 460, "Operations lens", 30, 850)}
    ${rounded(1170, 520, 320, 58, 16, "#f8fafc", "#dbe4f0")}${text(1196, 558, "All supervisors", 20, 500)}
    ${rounded(1510, 520, 320, 58, 16, "#f8fafc", "#dbe4f0")}${text(1536, 558, "Pick supervisor first", 20, 500, "#94a3b8")}
    <rect x="1170" y="805" width="620" height="18" rx="9" fill="#eef3fa"/><rect x="1170" y="805" width="${500 * ep}" height="18" rx="9" fill="url(#lineGrad)"/><rect x="${1170 + 500 * ep}" y="805" width="${90 * ep}" height="18" rx="9" fill="#fb7185"/>
    ${label(1070, 925, "Gain operational clarity")}
  `;
  return shell("Reports", "Reports", "Workspace analytics, meeting compliance, and operational clarity.", body, p);
}

function sceneEnding(t, p) {
  const ep = ease(p);
  const fadeToLogin = clamp((p - 0.68) / 0.3);
  const screens = [
    ["Dashboard", 470, 250, 0.78, "#fff"],
    ["Users", 940, 260, 0.72, "#fff"],
    ["Boards", 1380, 310, 0.7, "#fff"],
    ["Discord", 530, 650, 0.68, "#18191f"],
    ["Meetings", 1010, 660, 0.72, "#fff"],
    ["Reports", 1450, 650, 0.7, "#fff"],
  ].map(([n, x, y, sc, fill], i) => `
    <g transform="translate(${x + Math.sin(p * 5 + i) * 8},${y + Math.cos(p * 4 + i) * 8}) scale(${sc})" opacity="${0.18 + ep * 0.82}" filter="url(#softShadow)">
      ${rounded(-210, -110, 420, 220, 22, fill, fill === "#fff" ? "#dbe4f0" : "#333640")}
      ${text(0, -44, n, 28, 850, fill === "#fff" ? ink : "#fff", "middle")}
      <rect x="-150" y="0" width="${210 + i * 18}" height="14" rx="7" fill="${i % 2 ? cyan : purple}" opacity="0.8"/>
      <rect x="-150" y="36" width="${160 + i * 16}" height="12" rx="6" fill="#94a3b8" opacity="0.5"/>
    </g>`).join("");
  return `
    <g opacity="${1 - fadeToLogin}">
      ${screens}
      ${text(960, 455, "TaskFlow", 72, 850, ink, "middle")}
      ${text(960, 520, "Supervision. Collaboration. Clarity.", 30, 800, muted, "middle")}
      <circle cx="960" cy="560" r="${lerp(80, 520, fadeToLogin)}" fill="${purple}" opacity="${0.07 + fadeToLogin * 0.16}" filter="url(#blur60)"/>
    </g>
    <g opacity="${fadeToLogin}">
      ${sceneIntro(t, fadeToLogin)}
    </g>
  `;
}

function renderScene(t, name, p) {
  switch (name) {
    case "intro": return sceneIntro(t, p);
    case "dashboard": return sceneDashboard(t, p);
    case "users": return sceneUsers(t, p);
    case "boards": return sceneBoards(t, p);
    case "discord": return discordUI(t, p);
    case "tasks": return sceneTasks(t, p);
    case "meetings": return sceneMeetings(t, p);
    case "reports": return sceneReports(t, p);
    case "ending": return sceneEnding(t, p);
    default: return "";
  }
}

function svgFrame(frame) {
  const t = frame / FPS;
  const s = currentScene(t);
  const p = (t - s.start) / s.dur;
  const camera = 1 + 0.015 * Math.sin(t * 0.25) + 0.012 * ease(p);
  const cx = W / 2;
  const cy = H / 2;
  const isDiscord = s.name === "discord";
  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="orb" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#8b5cf6"/><stop offset="1" stop-color="#3CC1C0"/></linearGradient>
      <linearGradient id="lineGrad" x1="0" x2="1"><stop stop-color="${purple}"/><stop offset="1" stop-color="${cyan}"/></linearGradient>
      <linearGradient id="photoLike" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#475569"/><stop offset="0.55" stop-color="#64748b"/><stop offset="1" stop-color="#d8b4fe"/></linearGradient>
      <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.4" fill="#94a3b8" opacity="0.36"/></pattern>
      <filter id="blur60"><feGaussianBlur stdDeviation="60"/></filter>
      <filter id="softShadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="12" stdDeviation="18" flood-color="#64748b" flood-opacity="0.14"/></filter>
      <filter id="bigShadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="24" stdDeviation="34" flood-color="#111827" flood-opacity="0.22"/></filter>
      <filter id="glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="10" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <filter id="tinyGlow"><feDropShadow dx="0" dy="0" stdDeviation="8" flood-color="${purple}" flood-opacity="0.35"/></filter>
    </defs>
    ${isDiscord ? "" : background(t)}
    <g transform="translate(${cx},${cy}) scale(${camera}) translate(${-cx},${-cy})">
      ${renderScene(t, s.name, p)}
    </g>
    ${aiOrb(t, s.name, p)}
    <rect width="${W}" height="${H}" fill="none" stroke="#ffffff" opacity="0.25"/>
  </svg>`;
}

async function main() {
  const ffmpeg = spawn("ffmpeg", [
    "-y",
    "-f", "image2pipe",
    "-framerate", String(FPS),
    "-vcodec", "png",
    "-i", "-",
    "-f", "lavfi",
    "-i", `sine=frequency=92:sample_rate=48000:duration=${DURATION}`,
    "-filter_complex", "[1:a]volume=0.035[a]",
    "-map", "0:v",
    "-map", "[a]",
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "18",
    "-pix_fmt", "yuv420p",
    "-r", String(OUT_FPS),
    "-c:a", "aac",
    "-b:a", "128k",
    "-shortest",
    "-movflags", "+faststart",
    outFile,
  ], { stdio: ["pipe", "inherit", "inherit"] });

  for (let i = 0; i < TOTAL; i++) {
    const png = await sharp(Buffer.from(svgFrame(i))).png().toBuffer();
    if (!ffmpeg.stdin.write(png)) {
      await new Promise((resolve) => ffmpeg.stdin.once("drain", resolve));
    }
    if (i % FPS === 0) {
      process.stdout.write(`Rendered ${Math.round(i / FPS)}s / ${DURATION}s\r`);
    }
  }
  ffmpeg.stdin.end();
  await new Promise((resolve, reject) => {
    ffmpeg.on("close", (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
  });
  console.log(`\nCreated ${outFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
