/**
 * NotebookLM MCP Client
 * Spawns notebooklm-mcp as a sidecar HTTP server and provides a simple query API.
 */
import { spawn } from 'child_process';

const NLM_BIN   = '/Users/jj/.local/bin/notebooklm-mcp';
const NLM_PORT  = 8001;
const NLM_URL   = `http://127.0.0.1:${NLM_PORT}/mcp`;

// Zenduit account notebooks (josephjoy@zenduit.com)
export const NOTEBOOKS = {
  // Core product knowledge
  products:       '7cc86693-0025-4737-acb7-4e9d26de7297', // Zenduit Products (17 sources)
  zenduone:       'ee77c463-69a7-4049-81ab-9643da914b7f', // ZenduONE Dev (56 sources)
  zencam:         'a3229bc0-9547-476d-9167-876710b12a8c', // ZenCAM Fleet Safety & Dashcam (193 sources)
  fleetSafety:    '4062f318-2bcd-4952-bf36-a0be19eff468', // Fleet Safety Transformation: Coaching & ROI (52 sources)
  zenduconnect:   '0422d88f-b90e-4f55-bc29-5afb384c9558', // ZenduCONNECT (8 sources)

  // Customer meeting prep (use when researching similar companies)
  dufresne:       '04b2efdd-f77d-49c6-bc4f-7790f3e11fdd', // Dufresne (75 sources)
  midIsland:      'f87b9668-6309-48da-b62c-fa080e463422', // Mid Island Cabinets (77 sources)
  burnbrae:       '4cb313b4-9313-4a25-8341-83c59be20b6e', // Burnbrae Farms (119 sources)
  adsTelematics:  '5e48c12a-bea7-4bec-bfa8-90d22800d035', // Automated Driving Systems & Safety Scoring (64 sources)
};

let nlmProcess  = null;
let sessionId   = null;
let requestSeq  = 0;
let ready       = false;

// ── Low-level MCP HTTP call ───────────────────────────────────────────────────
async function mcpCall(method, params, retries = 2) {
  const id  = ++requestSeq;
  const hdrs = {
    'Content-Type':  'application/json',
    'Accept':        'application/json, text/event-stream',
  };
  if (sessionId) hdrs['mcp-session-id'] = sessionId;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(NLM_URL, {
        method:  'POST',
        headers: hdrs,
        body:    JSON.stringify({ jsonrpc: '2.0', method, params, id }),
        signal:  AbortSignal.timeout(30_000),
      });

      // Capture / refresh session ID
      const sid = res.headers.get('mcp-session-id');
      if (sid) sessionId = sid;

      const text  = await res.text();
      const lines = text.split('\n').filter(l => l.startsWith('data:'));

      for (const line of lines) {
        const obj = JSON.parse(line.slice(5));
        if (obj.id === id) {
          if (obj.result) return obj.result;
          if (obj.error)  throw new Error(obj.error.message);
        }
      }

      throw new Error('No matching result in MCP response');
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
  }
}

// ── Start sidecar process ─────────────────────────────────────────────────────
export function startNotebookLM() {
  return new Promise((resolve) => {
    // Kill existing if running
    if (nlmProcess) {
      try { nlmProcess.kill(); } catch {}
      nlmProcess = null;
      sessionId  = null;
    }

    nlmProcess = spawn(NLM_BIN, ['--transport', 'http', '--port', String(NLM_PORT)], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    let resolved = false;
    const done = () => { if (!resolved) { resolved = true; resolve(); } };

    nlmProcess.stderr.on('data', (chunk) => {
      const msg = chunk.toString();
      if (msg.includes('Application startup complete') || msg.includes('Uvicorn running')) {
        done();
      }
    });

    nlmProcess.on('error', (err) => {
      console.error('[NotebookLM] Process error:', err.message);
      done();
    });

    nlmProcess.on('exit', (code) => {
      ready = false;
      console.warn(`[NotebookLM] Process exited (code ${code})`);
    });

    // Fallback: assume ready after 4s
    setTimeout(done, 4_000);
  });
}

// ── Initialize MCP session ────────────────────────────────────────────────────
export async function initNotebookLM() {
  await mcpCall('initialize', {
    protocolVersion: '2024-11-05',
    capabilities:    {},
    clientInfo:      { name: 'zenduit-intel', version: '1.0' },
  });
  ready = true;
}

// ── Check if server already running (skip spawn if so) ───────────────────────
export async function checkRunning() {
  try {
    await mcpCall('initialize', {
      protocolVersion: '2024-11-05',
      capabilities:    {},
      clientInfo:      { name: 'zenduit-intel', version: '1.0' },
    });
    ready = true;
    return true;
  } catch {
    return false;
  }
}

// ── Query a notebook ──────────────────────────────────────────────────────────
export async function queryNotebook(notebookId, query) {
  if (!ready) throw new Error('NotebookLM not ready');

  const result = await mcpCall('tools/call', {
    name:      'notebook_query',
    arguments: { notebook_id: notebookId, query },
  });

  const text = result?.content?.[0]?.text;
  if (!text) {
    console.warn(`[NotebookLM] No text in result for notebook ${notebookId}`);
    return '';
  }

  try {
    const data = JSON.parse(text);
    const ans = data.answer || data.summary || '';
    if (!ans) console.warn(`[NotebookLM] No answer/summary in JSON for notebook ${notebookId}:`, text.slice(0, 100));
    return ans;
  } catch (err) {
    if (text.includes('"status":"error"')) {
       console.error(`[NotebookLM] Error response for notebook ${notebookId}:`, text);
       return '';
    }
    return text;
  }
}

// ── High-level: get rich Zenduit + company intel from all relevant notebooks ──
export async function getCompanyIntelFromNotebooks(companyName) {
  if (!ready) return null;

  const name = companyName || '';

  try {
    // Always query: Zenduit Products + ZenCAM (most comprehensive product knowledge)
    // + Fleet Safety ROI (for objection handling / value props)
    // + ADS Telematics (industry context, safety scoring)
    const queries = [
      {
        id:    NOTEBOOKS.products,
        label: 'ZENDUIT PRODUCT KNOWLEDGE',
        query: `Zenduit products features pricing ZenduONE ZenduCAM ZenduFuel ZenduMaintenance ZenduIQ value proposition differentiators`,
      },
      {
        id:    NOTEBOOKS.zencam,
        label: 'ZENCAM / FLEET SAFETY INTELLIGENCE',
        query: `${name} fleet safety dashcam AI video telematics driver coaching safety violations compliance ROI insurance savings`,
      },
      {
        id:    NOTEBOOKS.fleetSafety,
        label: 'FLEET SAFETY ROI & COACHING',
        query: `fleet safety transformation ROI coaching driver behavior fuel savings insurance reduction ${name}`,
      },
      {
        id:    NOTEBOOKS.adsTelematics,
        label: 'TELEMATICS INDUSTRY CONTEXT',
        query: `${name} fleet telematics safety scoring autonomous driving industry trends 2025 2026`,
      },
      {
        id:    NOTEBOOKS.zenduone,
        label: 'ZENDUONE DEEP FEATURE MATCH',
        query: `ZenduONE specific modules integrations pricing tiers onboarding case studies ROI results customer wins compliance ELD HOS maintenance fuel ${name}`,
      },
    ];

    const results = await Promise.allSettled(
      queries.map(q => queryNotebook(q.id, q.query).then(ans => ({ label: q.label, answer: ans })))
    );

    const parts = [];
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value?.answer) {
        parts.push(`${r.value.label}:\n${r.value.answer}`);
      }
    }

    return parts.length ? parts.join('\n\n---\n\n') : null;
  } catch (err) {
    console.warn('[NotebookLM] Query failed:', err.message);
    return null;
  }
}

// ── Bootstrap (call once at server startup) ───────────────────────────────────
export async function bootstrapNotebookLM() {
  console.log('[NotebookLM] Connecting to notebooklm-mcp...');

  // Try existing server first
  if (await checkRunning()) {
    console.log('[NotebookLM] ✅ Connected to existing notebooklm-mcp server');
    return true;
  }

  // Start fresh
  console.log('[NotebookLM] Starting notebooklm-mcp sidecar...');
  await startNotebookLM();

  try {
    await initNotebookLM();
    console.log('[NotebookLM] ✅ Sidecar started and initialized');
    return true;
  } catch (err) {
    console.error('[NotebookLM] ❌ Failed to initialize:', err.message);
    return false;
  }
}

export const isReady = () => ready;
