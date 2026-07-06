#!/usr/bin/env node
// Captures the product screenshots embedded in docs/index.html from the real
// frontend, with every /api route mocked in-process (no backend needed).
//
//   1. npm run dev:frontend        (Vite on http://127.0.0.1:5173)
//   2. node docs/scripts/capture-product-media.mjs
//
// The mock data must satisfy the Zod schemas in packages/shared/src — the
// frontend parses every response, so a shape drift fails loudly here.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const outDir = path.join(repoRoot, "docs", "assets", "screenshots");
const baseUrl = process.env.COMFLOW_CAPTURE_BASE_URL || "http://127.0.0.1:5173";
const debugCapture = process.env.COMFLOW_CAPTURE_DEBUG === "1";

function loadPlaywright() {
  const temp = process.env.TEMP || process.env.TMPDIR || "/tmp";
  const candidates = [
    process.env.PLAYWRIGHT_NODE_MODULES
      ? path.join(process.env.PLAYWRIGHT_NODE_MODULES, "playwright")
      : null,
    path.join(temp, "comflow-playwright", "node_modules", "playwright"),
    path.join(temp, "anchordesk-playwright", "node_modules", "playwright"),
    path.join(repoRoot, "node_modules", "playwright"),
    "playwright",
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      // try the next location
    }
  }

  throw new Error(
    [
      "Playwright is required to capture product media.",
      "Install it in a temp directory, then point PLAYWRIGHT_NODE_MODULES at that node_modules folder:",
      "  npm install --prefix %TEMP%\\comflow-playwright playwright",
      "  $env:PLAYWRIGHT_NODE_MODULES=\"$env:TEMP\\comflow-playwright\\node_modules\"",
      "Start the frontend first: npm run dev:frontend",
      "  node docs/scripts/capture-product-media.mjs",
    ].join("\n")
  );
}

function daysFromNow(days, hour, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/** Minimal valid PCM WAV so the <audio> players render a real, loadable clip. */
function buildWav(seconds = 2) {
  const sampleRate = 8000;
  const samples = sampleRate * seconds;
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples; i += 1) {
    const value = Math.round(Math.sin((i / sampleRate) * 2 * Math.PI * 440) * 6000);
    buffer.writeInt16LE(value, 44 + i * 2);
  }
  return buffer;
}

const wavBytes = buildWav();

// ── Demo data ────────────────────────────────────────────────────────────────

const demoUser = {
  id: "u-owner",
  email: "jess@spillerstech.example",
  displayName: "Jess Spillers",
  role: "owner",
  authProvider: "local",
  tenantId: "t-platform",
};

const mailboxes = [
  {
    id: "mb-1",
    name: "Main line",
    number: "+15556040199",
    greetingPromptId: "p-greet-1",
    sipAccountRef: "main",
    createdAt: daysFromNow(-90, 9),
    updatedAt: daysFromNow(-2, 14),
  },
  {
    id: "mb-2",
    name: "After-hours support",
    number: "+15556040147",
    greetingPromptId: null,
    sipAccountRef: null,
    createdAt: daysFromNow(-30, 9),
    updatedAt: daysFromNow(-30, 9),
  },
];

const prompts = [
  {
    id: "p-greet-1",
    name: "Front-desk greeting",
    kind: "greeting",
    mimeType: "audio/wav",
    audioUrl: "/api/prompts/p-greet-1/audio",
    createdAt: daysFromNow(-60, 10),
  },
  {
    id: "p-out-1",
    name: "Appointment reminder",
    kind: "outbound",
    mimeType: "audio/wav",
    audioUrl: "/api/prompts/p-out-1/audio",
    createdAt: daysFromNow(-14, 10),
  },
];

const callRows = [
  {
    id: "c-101",
    createdAt: daysFromNow(0, 8, 42),
    updatedAt: daysFromNow(0, 8, 45),
    callerName: "Sarah Mitchell",
    company: "Apex Manufacturing",
    callbackNumber: "+1 (555) 204-7823",
    intent: "support_request",
    urgency: "high",
    summary:
      "Customer portal down since 9am and blocking invoicing; wants a callback as soon as possible.",
    transcript:
      "Hi, this is Sarah Mitchell from Apex Manufacturing. Our portal has been down since about nine this morning and it's blocking our whole invoicing run. Could someone call me back as soon as you can? My direct line is 555-204-7823. Thanks.",
    status: "new",
    assignedQueue: null,
    recordingStatus: "ready",
    recordingPath: "recordings/c-101.wav",
    recordingMimeType: "audio/wav",
    telephonyCallId: "sip-8842-01",
    rawTranscript: null,
    reviewedAt: null,
    reviewedBy: null,
    syncedTicketId: null,
    syncedTicketProvider: null,
    syncedAt: null,
    mailboxId: "mb-1",
    source: "telephony",
  },
  {
    id: "c-102",
    createdAt: daysFromNow(0, 7, 58),
    updatedAt: daysFromNow(0, 10, 5),
    callerName: "Dan Okafor",
    company: "Northwind Clinic",
    callbackNumber: "+1 (555) 118-4402",
    intent: "billing_request",
    urgency: "normal",
    summary:
      "Question about a duplicate charge on last month's statement; fine with a callback after lunch.",
    transcript:
      "Hey, Dan Okafor over at Northwind Clinic. I think we got billed twice on the last statement — invoice 4471. Nothing urgent, any time after lunch works. 555-118-4402.",
    status: "reviewed",
    assignedQueue: "Billing",
    recordingStatus: "ready",
    recordingPath: "recordings/c-102.wav",
    recordingMimeType: "audio/wav",
    telephonyCallId: "sip-8842-02",
    rawTranscript: null,
    reviewedAt: daysFromNow(0, 10, 5),
    reviewedBy: "Jess Spillers",
    syncedTicketId: "10483",
    syncedTicketProvider: "anchordesk",
    syncedAt: daysFromNow(0, 10, 6),
    mailboxId: "mb-1",
    source: "telephony",
  },
  {
    id: "c-103",
    createdAt: daysFromNow(-1, 16, 24),
    updatedAt: daysFromNow(0, 9, 12),
    callerName: "Maya Chen",
    company: "Harbor Dental",
    callbackNumber: "+1 (555) 762-0110",
    intent: "sales_request",
    urgency: "normal",
    summary:
      "Interested in adding two more lines to their plan; asked for pricing before Friday.",
    transcript:
      "Hi, Maya Chen calling from Harbor Dental. We're opening a second location and probably need two more lines on our plan. Could someone send over pricing before Friday? Best number is 555-762-0110.",
    status: "assigned",
    assignedQueue: "Sales",
    recordingStatus: "ready",
    recordingPath: "recordings/c-103.wav",
    recordingMimeType: "audio/wav",
    telephonyCallId: "sip-8841-11",
    rawTranscript: null,
    reviewedAt: daysFromNow(0, 9, 12),
    reviewedBy: "Jess Spillers",
    syncedTicketId: "10471",
    syncedTicketProvider: "anchordesk",
    syncedAt: daysFromNow(0, 9, 13),
    mailboxId: "mb-1",
    source: "telephony",
  },
  {
    id: "c-104",
    createdAt: daysFromNow(-1, 11, 3),
    updatedAt: daysFromNow(-1, 11, 6),
    callerName: "Luis Romero",
    company: null,
    callbackNumber: "+1 (555) 330-9954",
    intent: "operator_request",
    urgency: "low",
    summary:
      "Asked to be transferred to the front desk; will try again tomorrow morning.",
    transcript:
      "Hi, it's Luis. I was trying to reach the front desk — I'll just try again tomorrow morning. You can also call me back at 555-330-9954.",
    status: "resolved",
    assignedQueue: null,
    recordingStatus: "ready",
    recordingPath: "recordings/c-104.wav",
    recordingMimeType: "audio/wav",
    telephonyCallId: "sip-8841-07",
    rawTranscript: null,
    reviewedAt: daysFromNow(-1, 12),
    reviewedBy: "Priya Shah",
    syncedTicketId: null,
    syncedTicketProvider: null,
    syncedAt: null,
    mailboxId: "mb-2",
    source: "telephony",
  },
  {
    id: "c-105",
    createdAt: daysFromNow(-1, 9, 47),
    updatedAt: daysFromNow(-1, 9, 50),
    callerName: null,
    company: null,
    callbackNumber: null,
    intent: "unknown",
    urgency: "unknown",
    summary: "Automated warranty robocall; no callback number left.",
    transcript:
      "We've been trying to reach you concerning your vehicle's extended warranty...",
    status: "spam",
    assignedQueue: null,
    recordingStatus: "ready",
    recordingPath: "recordings/c-105.wav",
    recordingMimeType: "audio/wav",
    telephonyCallId: "sip-8840-93",
    rawTranscript: null,
    reviewedAt: daysFromNow(-1, 10),
    reviewedBy: "Jess Spillers",
    syncedTicketId: null,
    syncedTicketProvider: null,
    syncedAt: null,
    mailboxId: "mb-1",
    source: "telephony",
  },
  {
    id: "c-106",
    createdAt: daysFromNow(0, 6, 15),
    updatedAt: daysFromNow(0, 6, 18),
    callerName: "Elena Fisher",
    company: "Ridgeline HVAC",
    callbackNumber: "+1 (555) 887-2216",
    intent: "support_request",
    urgency: "normal",
    summary:
      "Voicemail-to-ticket sync question after switching PBX; happy to email details instead.",
    transcript:
      "Morning! Elena Fisher with Ridgeline HVAC. We just switched PBXs and I want to make sure our voicemails still land in the ticket queue. Happy to email details — or ring me at 555-887-2216.",
    status: "new",
    assignedQueue: null,
    recordingStatus: "ready",
    recordingPath: "recordings/c-106.wav",
    recordingMimeType: "audio/wav",
    telephonyCallId: "sip-8842-05",
    rawTranscript: null,
    reviewedAt: null,
    reviewedBy: null,
    syncedTicketId: null,
    syncedTicketProvider: null,
    syncedAt: null,
    mailboxId: "mb-2",
    source: "telephony",
  },
];

function toListItem(call) {
  return {
    id: call.id,
    createdAt: call.createdAt,
    updatedAt: call.updatedAt,
    callerName: call.callerName,
    company: call.company,
    callbackNumber: call.callbackNumber,
    intent: call.intent,
    urgency: call.urgency,
    summary: call.summary,
    status: call.status,
    assignedQueue: call.assignedQueue,
    recordingStatus: call.recordingStatus,
    telephonyCallId: call.telephonyCallId,
    source: call.source,
  };
}

const notesByCall = {
  "c-101": [
    {
      id: "n-1",
      callId: "c-101",
      body: "Portal outage confirmed on our status page — engineering is on it. Calling Sarah back with an ETA.",
      createdAt: daysFromNow(0, 9, 5),
      authorName: "Jess Spillers",
    },
    {
      id: "n-2",
      callId: "c-101",
      body: "Left a voicemail with the 11am ETA; she asked for an email follow-up too.",
      createdAt: daysFromNow(0, 9, 40),
      authorName: "Priya Shah",
    },
  ],
};

const scheduledCalls = [
  {
    id: "sc-1",
    toNumber: "+1 (555) 204-7823",
    scheduledAt: daysFromNow(0, 15, 30),
    messageText:
      "Hi Sarah, this is Spillers Technology following up on this morning's portal outage. Service was restored at 11:05.",
    questionText: "Is everything working on your side now — yes or no?",
    status: "scheduled",
    answerTranscript: null,
    answerRecordingUrl: null,
    attempts: 0,
    lastError: null,
    createdAt: daysFromNow(0, 11, 10),
    updatedAt: daysFromNow(0, 11, 10),
  },
  {
    id: "sc-2",
    toNumber: "+1 (555) 762-0110",
    scheduledAt: daysFromNow(-1, 14, 0),
    messageText:
      "Hi Maya, confirming your onboarding call for Thursday at 2pm with our sales team.",
    questionText: "Does Thursday at 2pm still work for you?",
    status: "completed",
    answerTranscript: "Yes, Thursday at two works great. See you then.",
    answerRecordingUrl: "/api/scheduled-calls/sc-2/answer-recording",
    attempts: 1,
    lastError: null,
    createdAt: daysFromNow(-2, 9, 30),
    updatedAt: daysFromNow(-1, 14, 2),
  },
  {
    id: "sc-3",
    toNumber: "+1 (555) 330-9954",
    scheduledAt: daysFromNow(-1, 10, 0),
    messageText: "Hi Luis, returning your call from yesterday about the front desk.",
    questionText: "What's the best time to reach you today?",
    status: "no_answer",
    answerTranscript: null,
    answerRecordingUrl: null,
    attempts: 2,
    lastError: null,
    createdAt: daysFromNow(-2, 16, 45),
    updatedAt: daysFromNow(-1, 10, 4),
  },
];

const wallet = {
  creditCents: 20000,
  billedCents: 5731,
  balanceCents: 14269,
  plan: "team",
  stripeCustomerId: "cus_demo123",
};

const usageSummary = {
  month: new Date().toISOString().slice(0, 7),
  lines: [
    { type: "inbound_minute", quantity: 212, carrierCents: 191, billedCents: 287 },
    { type: "outbound_minute", quantity: 38, carrierCents: 53, billedCents: 80 },
    { type: "did_rental", quantity: 2, carrierCents: 170, billedCents: 255 },
    { type: "stt", quantity: 96, carrierCents: 58, billedCents: 87 },
    { type: "llm", quantity: 96, carrierCents: 240, billedCents: 360 },
    { type: "tts", quantity: 12, carrierCents: 18, billedCents: 27 },
  ],
  totalCarrierCents: 730,
  totalBilledCents: 1096,
  limits: {
    maxConcurrentCalls: 3,
    maxDids: 2,
    includedMinutes: 100,
    markupBps: 15000,
  },
};

const tenants = [
  {
    id: "t-platform",
    name: "Spillers Technology",
    slug: "spillers-technology",
    plan: "owner",
    status: "active",
    createdAt: daysFromNow(-120, 9),
    updatedAt: daysFromNow(-1, 9),
  },
  {
    id: "t-apex",
    name: "Apex Manufacturing",
    slug: "apex-manufacturing",
    plan: "team",
    status: "active",
    createdAt: daysFromNow(-45, 9),
    updatedAt: daysFromNow(0, 8),
  },
  {
    id: "t-harbor",
    name: "Harbor Dental",
    slug: "harbor-dental",
    plan: "solo",
    status: "active",
    createdAt: daysFromNow(-21, 9),
    updatedAt: daysFromNow(-3, 15),
  },
  {
    id: "t-oldco",
    name: "Oldco Logistics",
    slug: "oldco-logistics",
    plan: "team",
    status: "suspended",
    createdAt: daysFromNow(-90, 9),
    updatedAt: daysFromNow(-7, 12),
  },
];

const tenantLimits = {
  "t-apex": { maxConcurrentCalls: 3, maxDids: 2, includedMinutes: 100, markupBps: 15000 },
  "t-harbor": { maxConcurrentCalls: 1, maxDids: 1, includedMinutes: 60, markupBps: 15000 },
};

const provisionedDids = [
  {
    id: "did-1",
    number: "+15556040199",
    provider: "voipms",
    status: "active",
    monthlyCents: 85,
    perMinuteCents: 1,
    mailboxId: "mb-1",
    createdAt: daysFromNow(-45, 10),
    releasedAt: null,
  },
  {
    id: "did-2",
    number: "+15556040147",
    provider: "voipms",
    status: "active",
    monthlyCents: 85,
    perMinuteCents: 1,
    mailboxId: "mb-2",
    createdAt: daysFromNow(-21, 10),
    releasedAt: null,
  },
];

const availableDids = [
  { number: "+15556041020", description: "New York, NY", region: "NY", setupCents: 0, monthlyCents: 85, perMinuteCents: 1 },
  { number: "+15556041021", description: "New York, NY", region: "NY", setupCents: 0, monthlyCents: 85, perMinuteCents: 1 },
  { number: "+15556041305", description: "Brooklyn, NY", region: "NY", setupCents: 0, monthlyCents: 85, perMinuteCents: 1 },
];

const engineSettings = {
  settings: {
    llm: { provider: "anthropic", model: "claude-haiku-4-5" },
    stt: { provider: "openai", model: "whisper-1" },
    tts: { provider: "elevenlabs", model: "eleven_multilingual_v2", voice: "Rachel" },
  },
  readiness: {
    llm: { provider: "anthropic", model: "claude-haiku-4-5", ready: true, missingSecrets: [] },
    stt: { provider: "openai", model: "whisper-1", ready: true, missingSecrets: [] },
    tts: { provider: "elevenlabs", model: "eleven_multilingual_v2", voice: "Rachel", ready: true, missingSecrets: [] },
  },
  secrets: {
    openaiApiKey: { configured: true, source: "env" },
    anthropicApiKey: { configured: true, source: "env" },
    elevenLabsApiKey: { configured: true, source: "stored" },
  },
};

const sipStatus = {
  telephonyMode: "baresip",
  controlHost: "baresip",
  controlPort: 4444,
  controlConnected: true,
  accountsPath: "/config/accounts",
  accountsLastWrittenAt: daysFromNow(-2, 14),
  restartSupported: true,
  restartMechanism: "supervisor",
};

const sipSettings = {
  settings: {
    enabled: true,
    accountLabel: "main",
    accountUri: "sip:comflow@sip.example.net",
    authUsername: "comflow",
    outboundProxy: null,
    outboundDialingDomain: "sip.example.net",
    registrationInterval: 600,
    preferredCodecs: ["PCMU/8000/1", "PCMA/8000/1"],
  },
  secrets: { authPassword: { configured: true, source: "stored" } },
  status: sipStatus,
};

// ── Mock API ─────────────────────────────────────────────────────────────────

function json(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function wav(route) {
  return route.fulfill({ status: 200, contentType: "audio/wav", body: wavBytes });
}

async function handleApi(route) {
  const request = route.request();
  const url = new URL(request.url());
  const apiPath = url.pathname.replace(/^\/api/, "");
  const method = request.method();
  if (debugCapture) console.log(`API ${method} ${apiPath}${url.search}`);

  if (method === "GET" && apiPath === "/auth/me") {
    return json(route, {
      user: demoUser,
      authRequired: true,
      localEnabled: true,
      providers: [{ id: "oidc", label: "Authentik" }],
    });
  }
  if (method === "GET" && apiPath === "/auth/providers") {
    return json(route, {
      localEnabled: true,
      providers: [{ id: "oidc", label: "Authentik" }],
    });
  }

  if (method === "GET" && apiPath === "/calls") {
    const status = url.searchParams.get("status");
    const intent = url.searchParams.get("intent");
    const q = (url.searchParams.get("q") || "").toLowerCase();
    let items = callRows;
    if (status) items = items.filter((c) => c.status === status);
    if (intent) items = items.filter((c) => c.intent === intent);
    if (q) {
      items = items.filter((c) =>
        [c.callerName, c.company, c.summary, c.callbackNumber]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))
      );
    }
    return json(route, { items: items.map(toListItem) });
  }

  let match = apiPath.match(/^\/calls\/([^/]+)\/recording/);
  if (method === "GET" && match) return wav(route);

  match = apiPath.match(/^\/calls\/([^/]+)$/);
  if (method === "GET" && match) {
    const call = callRows.find((c) => c.id === match[1]);
    if (!call) return json(route, { error: "not found" }, 404);
    return json(route, {
      call,
      notes: notesByCall[call.id] ?? [],
      recordingUrl: `/api/calls/${call.id}/recording`,
      recordingDownloadUrl: `/api/calls/${call.id}/recording?download=1`,
    });
  }

  if (method === "GET" && apiPath === "/scheduled-calls") {
    return json(route, { items: scheduledCalls });
  }
  if (method === "GET" && /^\/scheduled-calls\/[^/]+\/answer-recording$/.test(apiPath)) {
    return wav(route);
  }

  if (method === "GET" && apiPath === "/prompts") {
    const kind = url.searchParams.get("kind");
    return json(route, {
      items: kind ? prompts.filter((p) => p.kind === kind) : prompts,
    });
  }
  if (method === "GET" && /^\/prompts\/[^/]+\/audio$/.test(apiPath)) return wav(route);

  if (method === "GET" && apiPath === "/mailboxes") return json(route, { items: mailboxes });

  if (method === "GET" && apiPath === "/settings/engines") return json(route, engineSettings);
  if (method === "GET" && apiPath === "/settings/sip") return json(route, sipSettings);
  if (method === "GET" && apiPath === "/settings/sip/status") return json(route, { status: sipStatus });

  if (method === "GET" && apiPath === "/billing") return json(route, { wallet });
  if (method === "GET" && apiPath === "/usage") return json(route, { summary: usageSummary });

  if (method === "GET" && apiPath === "/dids") return json(route, { items: provisionedDids });
  if (method === "GET" && apiPath === "/dids/search") return json(route, { items: availableDids });

  if (method === "GET" && apiPath === "/tenants") return json(route, { items: tenants });
  match = apiPath.match(/^\/tenants\/([^/]+)\/limits$/);
  if (method === "GET" && match) {
    return json(route, {
      limits: tenantLimits[match[1]] ?? usageSummary.limits,
    });
  }

  if (debugCapture) console.log(`  (unmatched, returning {})`);
  return json(route, {});
}

// ── Capture ──────────────────────────────────────────────────────────────────

async function waitForServer() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(baseUrl, { signal: AbortSignal.timeout(3000) });
      if (res.ok) return;
    } catch {
      // keep waiting
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${baseUrl}`);
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const { chromium } = loadPlaywright();

  let browser;
  try {
    console.log(`Using ComFlow frontend at ${baseUrl}...`);
    await waitForServer();
    console.log("Launching Chromium...");
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
    if (debugCapture) {
      page.on("console", (message) => console.log(`BROWSER ${message.type()}: ${message.text()}`));
      page.on("pageerror", (error) => console.log(`BROWSER pageerror: ${error.message}`));
    }
    await page.route("**/*", (route) => {
      const pathname = new URL(route.request().url()).pathname;
      return pathname.startsWith("/api/") ? handleApi(route) : route.continue();
    });

    async function capture(name, waitFor) {
      await page.addStyleTag({
        content: `
          *, *::before, *::after {
            transition-duration: 0s !important;
            animation-duration: 0s !important;
            caret-color: transparent !important;
          }
        `,
      });
      try {
        await waitFor();
      } catch (error) {
        if (debugCapture) {
          console.log(`${name} wait failed. Body text:`);
          console.log(await page.locator("body").innerText({ timeout: 2000 }).catch((e) => e.message));
          await page.screenshot({ path: path.join(outDir, `debug-${name}.jpg`), type: "jpeg", quality: 85 });
        }
        throw error;
      }
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(outDir, `${name}.jpg`), type: "jpeg", quality: 90 });
      console.log(`  captured ${name}.jpg`);
    }

    console.log("Rendering inbox...");
    await page.goto(`${baseUrl}/calls`, { waitUntil: "domcontentloaded" });
    await capture("comflow-inbox", () =>
      page.getByText("Sarah Mitchell", { exact: false }).waitFor({ timeout: 20_000 })
    );

    console.log("Rendering call detail...");
    await page.goto(`${baseUrl}/calls/c-101`, { waitUntil: "domcontentloaded" });
    await capture("comflow-call-detail", () =>
      page.getByText("Portal outage confirmed", { exact: false }).waitFor({ timeout: 20_000 })
    );

    console.log("Rendering scheduled calls...");
    await page.goto(`${baseUrl}/scheduled-calls`, { waitUntil: "domcontentloaded" });
    await capture("comflow-scheduled", async () => {
      const answer = page.getByText("Thursday at two works great", { exact: false });
      await answer.waitFor({ timeout: 20_000 });
      // Scroll so the queued call and the completed one (with its captured
      // answer) share the frame, instead of the mostly-empty compose form.
      await answer.scrollIntoViewIfNeeded();
      await page.mouse.wheel(0, 120);
    });

    console.log("Rendering settings → mailboxes (DID manager)...");
    await page.goto(`${baseUrl}/settings`, { waitUntil: "domcontentloaded" });
    await page.getByRole("tab", { name: "Mailboxes" }).click();
    await capture("comflow-dids-mailboxes", () =>
      page.getByText("Phone numbers (DIDs)", { exact: false }).waitFor({ timeout: 20_000 })
    );

    console.log("Rendering billing & usage...");
    await page.goto(`${baseUrl}/billing`, { waitUntil: "domcontentloaded" });
    await capture("comflow-billing", () =>
      page.getByText("Extraction (LLM)", { exact: false }).waitFor({ timeout: 20_000 })
    );

    console.log("Rendering tenants (owner dashboard)...");
    await page.goto(`${baseUrl}/tenants`, { waitUntil: "domcontentloaded" });
    await capture("comflow-tenants", () =>
      page.getByText("Onboard a tenant", { exact: false }).waitFor({ timeout: 20_000 })
    );

    console.log(`Captured screenshots in ${path.relative(repoRoot, outDir)}`);
  } finally {
    if (browser) await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
