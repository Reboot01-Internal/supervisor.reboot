import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";

const W = 1920;
const H = 1080;
const FPS = 24;
const OUT_FPS = 60;
const INTRO_DUR = 3.0;
const SLIDE_DUR = 2.8;
const TRANSITION = 0.82;
const screenshotDir = path.resolve("video-screenshots");
const outDir = path.resolve("artifacts");
const outFile = path.join(outDir, "taskflow-booth-showcase-smooth-quotes.mp4");

fs.mkdirSync(outDir, { recursive: true });

const files = fs
  .readdirSync(screenshotDir)
  .filter((f) => /\.(png|jpe?g)$/i.test(f))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  .map((f) => path.join(screenshotDir, f));

if (!files.length) {
  throw new Error(`No screenshots found in ${screenshotDir}`);
}

const totalDuration = INTRO_DUR + files.length * SLIDE_DUR;
const totalFrames = Math.round(totalDuration * FPS);

const captions = [
  "Welcome to TaskFlow",
  "Admin dashboard overview",
  "User management at scale",
  "Find and queue talents",
  "Assignment visibility",
  "Talent assignment workflow",
  "Board operations",
  "Connected workspace creation",
  "Discord channel automation",
  "Synced Discord members",
  "Board appears instantly",
  "Task details and ownership",
  "Due dates, priority, comments",
  "Visual task management",
  "Automated Discord assignment",
  "Meeting calendar",
  "Book meetings from the board",
  "Pinned meeting reminders",
  "Notification hub",
  "Reports and operational clarity",
];

const lensPositions = [
  [1420, 720], [1360, 310], [1560, 225], [890, 350], [540, 245],
  [1440, 230], [1715, 120], [1510, 870], [1545, 890], [420, 240],
  [1550, 120], [1430, 800], [1180, 750], [1660, 310], [720, 890],
  [1705, 118], [1410, 890], [960, 175], [1660, 365], [660, 565],
];

const quotes = [
  "A calmer way to supervise every moving part.",
  "One dashboard for people, boards, meetings, and clarity.",
  "Every user stays visible. Every assignment stays connected.",
  "Find the right talent and move work forward instantly.",
  "Profiles turn context into confident decisions.",
  "Supervisors and talents align without extra coordination.",
  "Boards become the operational home for each workflow.",
  "Create a workspace once. Keep the whole team in sync.",
  "Discord channels appear exactly where collaboration happens.",
  "Members, roles, and channels stay connected automatically.",
  "New boards are ready the moment the team is ready.",
  "Tasks carry ownership, dates, priority, and momentum.",
  "Everything important lives inside the card.",
  "Visual work management built for daily execution.",
  "Assignments reach the team where they already collaborate.",
  "Meetings become part of the operating rhythm.",
  "Scheduling is clear, structured, and connected to the board.",
  "Pinned reminders keep everyone aligned before the meeting starts.",
  "Notifications surface the work that needs attention.",
  "Reports turn activity into operational clarity.",
];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => 0.5 - Math.cos(Math.PI * clamp(t)) / 2;

function quoteOverlay(i, local) {
  const step = i + 1;
  const progress = (i + local) / files.length;
  const quote = quotes[i] ?? captions[i] ?? "TaskFlow";
  const title = captions[i] ?? "TaskFlow";
  const fadeIn = ease(local / 0.22);
  const fadeOut = 1 - ease((local - 0.78) / 0.22);
  const opacity = Math.min(fadeIn, fadeOut);
  const y = lerp(934, 914, ease(local));

  return `
    <g opacity="${0.92}">
      <rect x="72" y="70" width="270" height="8" rx="4" fill="#ffffff" opacity="0.4"/>
      <rect x="72" y="70" width="${270 * progress}" height="8" rx="4" fill="url(#g)"/>
      <text x="72" y="106" font-family="Inter, SF Pro Display, Arial, sans-serif" font-size="14" font-weight="800" letter-spacing="3" fill="#ffffff" opacity="0.72">TASKFLOW / ${String(step).padStart(2, "0")}</text>
      <g filter="url(#shadow)">
        <rect x="90" y="${y - 34}" width="890" height="112" rx="34" fill="#ffffff" opacity="${0.84 * opacity}" stroke="#dbe4f0"/>
        <circle cx="128" cy="${y + 20}" r="17" fill="url(#g)" opacity="${0.9 * opacity}"/>
        <text x="166" y="${y}" font-family="Inter, SF Pro Display, Arial, sans-serif" font-size="17" font-weight="800" letter-spacing="2" fill="#6F5BFF" opacity="${0.9 * opacity}">${esc(title.toUpperCase())}</text>
        <text x="166" y="${y + 38}" font-family="Inter, SF Pro Display, Arial, sans-serif" font-size="27" font-weight="850" fill="#0f172a" opacity="${opacity}">“${esc(quote)}”</text>
      </g>
    </g>
  `;
}

function welcomeOverlay(t) {
  const p = clamp(t / INTRO_DUR);
  const inP = ease(p / 0.42);
  const outP = 1 - ease((p - 0.78) / 0.22);
  const opacity = Math.min(inP, outP);
  const titleY = lerp(552, 510, ease(p));
  return `
    <g opacity="${opacity}">
      <rect width="${W}" height="${H}" fill="#070914" opacity="${0.46 * opacity}"/>
      <circle cx="960" cy="510" r="${180 + 90 * ease(p)}" fill="none" stroke="url(#g)" stroke-width="2" opacity="0.32"/>
      <circle cx="960" cy="510" r="${270 + 80 * ease(p)}" fill="none" stroke="#ffffff" stroke-width="1" opacity="0.12"/>
      <text x="960" y="${titleY}" text-anchor="middle" font-family="Inter, SF Pro Display, Arial, sans-serif" font-size="76" font-weight="900" fill="#ffffff">Welcome to TaskFlow</text>
      <text x="960" y="${titleY + 58}" text-anchor="middle" font-family="Inter, SF Pro Display, Arial, sans-serif" font-size="25" font-weight="750" fill="#dbeafe" opacity="0.92">Supervision. Collaboration. Clarity.</text>
      <text x="960" y="${titleY + 118}" text-anchor="middle" font-family="Inter, SF Pro Display, Arial, sans-serif" font-size="20" font-weight="700" letter-spacing="4" fill="#7dd3fc" opacity="0.82">AN INTELLIGENT OPERATIONS SHOWCASE</text>
    </g>
  `;
}

function overlaySvg(i, local, t, transitionMix = 0, intro = false) {
  const [lx, ly] = lensPositions[i % lensPositions.length];
  const bob = Math.sin(t * 1.4 + i) * 5;
  const pulse = 0.65 + 0.35 * Math.sin(t * 3.2);
  let particles = "";
  for (let p = 0; p < 34; p++) {
    const x = (p * 173 + t * (5 + (p % 5))) % W;
    const y = (p * 97 + Math.sin(t * 0.55 + p) * 14) % H;
    const color = p % 2 ? "#3CC1C0" : "#6F5BFF";
    particles += `<circle cx="${x}" cy="${y}" r="${1 + (p % 3) * 0.45}" fill="${color}" opacity="${0.08 + 0.1 * Math.sin(t + p)}"/>`;
  }

  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop stop-color="#6F5BFF"/><stop offset="1" stop-color="#3CC1C0"/>
        </linearGradient>
        <linearGradient id="scan" x1="0" x2="1">
          <stop stop-color="#3CC1C0" stop-opacity="0"/>
          <stop offset="0.5" stop-color="#3CC1C0" stop-opacity="0.48"/>
          <stop offset="1" stop-color="#6F5BFF" stop-opacity="0"/>
        </linearGradient>
        <filter id="blur"><feGaussianBlur stdDeviation="34"/></filter>
        <filter id="glow" x="-90%" y="-90%" width="280%" height="280%">
          <feGaussianBlur stdDeviation="9" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="shadow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="16" stdDeviation="20" flood-color="#0f172a" flood-opacity="0.28"/>
        </filter>
      </defs>
      <rect width="${W}" height="${H}" fill="#0f172a" opacity="0.06"/>
      ${particles}
      <circle cx="230" cy="120" r="260" fill="#6F5BFF" opacity="0.18" filter="url(#blur)"/>
      <circle cx="1680" cy="940" r="300" fill="#3CC1C0" opacity="0.14" filter="url(#blur)"/>
      <rect width="${W}" height="${H}" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.16"/>
      ${intro ? welcomeOverlay(t) : quoteOverlay(i, local)}
      <g transform="translate(${lx},${ly + bob})" filter="url(#glow)" opacity="${(intro ? 0.28 : 0.5) - transitionMix * 0.22}">
        <circle cx="0" cy="0" r="54" fill="#ffffff" opacity="0.2"/>
        <circle cx="0" cy="0" r="46" fill="none" stroke="url(#g)" stroke-width="5" stroke-dasharray="${150 + pulse * 80} 90" transform="rotate(${t * 38})"/>
        <circle cx="0" cy="0" r="27" fill="none" stroke="#ffffff" stroke-width="1.5" opacity="0.55"/>
        <line x1="-72" x2="72" y1="0" y2="0" stroke="#3CC1C0" stroke-width="2" opacity="0.42"/>
        <line x1="0" x2="0" y1="-72" y2="72" stroke="#6F5BFF" stroke-width="2" opacity="0.34"/>
        <circle cx="0" cy="0" r="5" fill="#ffffff" opacity="0.86"/>
        <path d="M-34 -18 C-10 -34 18 -30 35 -10" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.48"/>
      </g>
      <rect width="${W}" height="${H}" fill="#ffffff" opacity="${0.24 * transitionMix}"/>
    </svg>
  `);
}

async function imageLayer(file, slideIndex, local) {
  const meta = await sharp(file).metadata();
  const baseScale = Math.min(W / meta.width, H / meta.height);
  const fitW = Math.round(meta.width * baseScale);
  const fitH = Math.round(meta.height * baseScale);
  const zoom = 1 + 0.018 * ease(local);
  const w = Math.round(fitW * zoom);
  const h = Math.round(fitH * zoom);
  const panX = Math.sin((slideIndex + 1) * 1.37) * 14 * ease(local);
  const panY = Math.cos((slideIndex + 1) * 1.11) * 10 * ease(local);

  const bg = await sharp(file)
    .resize(W, H, { fit: "cover" })
    .blur(26)
    .modulate({ brightness: 0.78, saturation: 1.05 })
    .png()
    .toBuffer();

  const rawX = Math.round((W - w) / 2 + panX);
  const rawY = Math.round((H - h) / 2 + panY);
  const cropLeft = Math.max(0, Math.min(w - Math.min(w, W), -rawX));
  const cropTop = Math.max(0, Math.min(h - Math.min(h, H), -rawY));
  const cropW = Math.min(w, W);
  const cropH = Math.min(h, H);
  const fg = await sharp(file)
    .resize(w, h, { fit: "fill" })
    .extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH })
    .png()
    .toBuffer();

  const x = Math.max(0, rawX);
  const y = Math.max(0, rawY);

  return sharp({
    create: { width: W, height: H, channels: 4, background: "#f5f7fb" },
  })
    .composite([
      { input: bg, left: 0, top: 0 },
      { input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#0f172a" opacity="0.18"/></svg>`), left: 0, top: 0 },
      { input: fg, left: x, top: y },
    ])
    .png()
    .toBuffer();
}

async function frameBuffer(frame) {
  const t = frame / FPS;
  const sceneT = Math.max(0, t - INTRO_DUR);
  const raw = sceneT / SLIDE_DUR;
  const i = Math.min(files.length - 1, Math.floor(raw));
  const local = raw - i;
  const current = await imageLayer(files[i], i, local);
  let composed = sharp(current);

  const transitionStart = 1 - TRANSITION / SLIDE_DUR;
  const mix = i < files.length - 1 ? ease((local - transitionStart) / (1 - transitionStart)) : 0;
  if (mix > 0) {
    const next = await imageLayer(files[i + 1], i + 1, 0);
    composed = composed.composite([{ input: next, left: 0, top: 0, opacity: mix }]);
  }

  return composed
    .composite([{ input: overlaySvg(i, local, t, mix, t < INTRO_DUR), left: 0, top: 0 }])
    .png()
    .toBuffer();
}

async function main() {
  const ffmpeg = spawn("ffmpeg", [
    "-y",
    "-f", "image2pipe",
    "-framerate", String(FPS),
    "-vcodec", "png",
    "-i", "-",
    "-f", "lavfi",
    "-i", `sine=frequency=96:sample_rate=48000:duration=${totalDuration}`,
    "-filter_complex", "[1:a]volume=0.028[a]",
    "-map", "0:v",
    "-map", "[a]",
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "17",
    "-pix_fmt", "yuv420p",
    "-r", String(OUT_FPS),
    "-c:a", "aac",
    "-b:a", "128k",
    "-shortest",
    "-movflags", "+faststart",
    outFile,
  ], { stdio: ["pipe", "inherit", "inherit"] });

  for (let f = 0; f < totalFrames; f++) {
    const png = await frameBuffer(f);
    if (!ffmpeg.stdin.write(png)) {
      await new Promise((resolve) => ffmpeg.stdin.once("drain", resolve));
    }
    if (f % FPS === 0) process.stdout.write(`Rendered ${Math.round(f / FPS)}s / ${Math.round(totalDuration)}s\r`);
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
