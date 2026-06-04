/**
 * LinkedIn MCP Client
 * Spawns linkedin-scraper-mcp as a sidecar HTTP server and provides a simple query API.
 */
import { spawn } from 'child_process';

const NLM_PORT  = 8002;
const NLM_URL   = `http://127.0.0.1:${NLM_PORT}/mcp`;

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
export function startLinkedInMCP() {
  return new Promise((resolve) => {
    // Kill existing if running
    if (nlmProcess) {
      try { nlmProcess.kill(); } catch {}
      nlmProcess = null;
      sessionId  = null;
    }

    const env = { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH}` };

    nlmProcess = spawn('uvx', [
      'linkedin-scraper-mcp', 
      '--transport', 'streamable-http', 
      '--port', String(NLM_PORT)
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
      env
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
      console.error('[LinkedIn] Process error:', err.message);
      done();
    });

    nlmProcess.on('exit', (code) => {
      ready = false;
      console.warn(`[LinkedIn] Process exited (code ${code})`);
    });

    // Fallback: assume ready after 8s
    setTimeout(done, 8_000);
  });
}

// ── Initialize MCP session ────────────────────────────────────────────────────
export async function initLinkedInMCP() {
  await mcpCall('initialize', {
    protocolVersion: '2024-11-05',
    capabilities:    {},
    clientInfo:      { name: 'zenduit-intel-linkedin', version: '1.0' },
  });
  ready = true;
}

// ── Check if server already running ───────────────────────────────────────────
export async function checkRunning() {
  try {
    await mcpCall('initialize', {
      protocolVersion: '2024-11-05',
      capabilities:    {},
      clientInfo:      { name: 'zenduit-intel-linkedin', version: '1.0' },
    });
    ready = true;
    return true;
  } catch {
    return false;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractLinkedInUsername(url) {
  if (!url) return null;
  // Match linkedin.com/in/username or linkedin.com/company/username
  const match = url.match(/(?:in|company)\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : url.replace(/[^a-zA-Z0-9_-]/g, ''); // Fallback to raw string if it's already an ID
}

async function callTool(name, args) {
  if (!ready) return null;
  try {
    const result = await mcpCall('tools/call', { name, arguments: args });
    const text = result?.content?.[0]?.text;
    if (!text) return null;
    return JSON.parse(text);
  } catch (err) {
    console.warn(`[LinkedIn] Tool ${name} failed:`, err.message);
    return null;
  }
}

// ── Exported Data Fetchers ────────────────────────────────────────────────────

export async function getLinkedInCompanyData(companyUrlOrName) {
  if (!ready || !companyUrlOrName) return null;
  const username = extractLinkedInUsername(companyUrlOrName);
  
  console.log(`[LinkedIn] Fetching company profile: ${username}`);
  const profile = await callTool('get_company_profile', { company_name: username });
  if (profile?.error) {
     console.warn('[LinkedIn] getCompanyProfile returned error:', profile.error);
     return null;
  }
  
  console.log(`[LinkedIn] Fetching company posts: ${username}`);
  const posts = await callTool('get_company_posts', { company_name: username });
  
  return {
    profile,
    posts: posts?.posts || []
  };
}

export async function getLinkedInPersonData(personUrlOrName) {
  if (!ready || !personUrlOrName) return null;
  const username = extractLinkedInUsername(personUrlOrName);
  
  console.log(`[LinkedIn] Fetching person profile: ${username}`);
  const profile = await callTool('get_person_profile', { linkedin_username: username });
  
  console.log(`[LinkedIn] Fetching person posts: ${username}`);
  const posts = await callTool('get_person_posts', { linkedin_username: username });
  
  return {
    profile,
    posts: posts?.posts || []
  };
}

export async function bootstrapLinkedInMCP() {
  console.log('[LinkedIn] Connecting to linkedin-mcp...');
  if (await checkRunning()) {
    console.log('[LinkedIn] ✅ Connected to existing linkedin-mcp server');
    return true;
  }

  console.log('[LinkedIn] Starting linkedin-mcp sidecar...');
  await startLinkedInMCP();

  try {
    await initLinkedInMCP();
    console.log('[LinkedIn] ✅ Sidecar started and initialized');
    return true;
  } catch (err) {
    console.error('[LinkedIn] ❌ Failed to initialize:', err.message);
    return false;
  }
}

export const isReady = () => ready;
