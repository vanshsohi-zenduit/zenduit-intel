/**
 * Zenduit Outbound Intelligence Backend
 * Express server — Groq llama-3.3-70b with web search + NotebookLM MCP
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Groq from 'groq-sdk';
import fs from 'fs';
import path from 'path';
import { bootstrapNotebookLM, getCompanyIntelFromNotebooks, isReady as nlmReady } from './notebooklm.js';
import { bootstrapLinkedInMCP, getLinkedInCompanyData, getLinkedInPersonData, isReady as linkedinReady } from './linkedin.js';

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: 'http://localhost:8080' }));
app.use(express.json());

// ─── Groq client with key rotation ───────────────────────────────────────────
const GROQ_KEYS = [
  process.env.GROQ_API_KEY,
  process.env.GROQ_API_KEY_2,
  process.env.GROQ_API_KEY_3,
  process.env.GROQ_API_KEY_4,
  process.env.GROQ_API_KEY_5,
].filter(Boolean);

let activeKeyIdx = 0;
const getGroq = () => new Groq({ apiKey: GROQ_KEYS[activeKeyIdx] });

// Delay helper
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Serial queue — ensures Groq calls are staggered to avoid token/min bursts.
// Each call waits for the previous to finish + 2.5 s before starting.
let _queue = Promise.resolve();

const groqWithFallback = async (fn) => {
  const run = async () => {
    for (let attempt = 0; attempt < GROQ_KEYS.length; attempt++) {
      try {
        const result = await fn(new Groq({ apiKey: GROQ_KEYS[activeKeyIdx] }));
        await delay(2500); // stagger before the next call can start
        return result;
      } catch (err) {
        const isRateLimit = err?.status === 429
          || err?.message?.includes('rate')
          || err?.message?.includes('quota');
        if (isRateLimit && attempt < GROQ_KEYS.length - 1) {
          activeKeyIdx = (activeKeyIdx + 1) % GROQ_KEYS.length;
          console.warn(`[Groq] Rate limit — rotating to key ${activeKeyIdx + 1}`);
          await delay(3000); // penalty wait before retry on new key
          continue;
        }
        throw err;
      }
    }
  };

  // Chain onto the shared queue so calls execute serially
  _queue = _queue.then(run, run);
  return _queue;
};

const groq  = getGroq();
const MODEL = 'llama-3.3-70b-versatile';

// ─── Zenduit product context ──────────────────────────────────────────────────
const ZENDUIT_CONTEXT = `
Zenduit (zenduit.com) is a fleet management and telematics platform serving mid-to-large enterprise fleets.
Core products:
- ZenduONE: Unified fleet intelligence platform — GPS tracking, driver behavior, maintenance, compliance.
- ZenduCAM: AI-powered in-cab video safety — event-triggered recording, live streaming, driver coaching.
- ZenduFuel: Fuel monitoring and theft detection with real-time alerts.
- ZenduMaintenance: Predictive maintenance scheduling based on engine data.
- ZenduIQ: Analytics and reporting dashboard.
- ZenduCONNECT: Integration hub connecting fleet systems.

Key value pillars:
1. DOT Safety & Compliance — ELD/HOS compliance, DVIR, violation alerts.
2. Operational Efficiency — Idle reduction (avg 12%), route optimization, utilization reporting.
3. Driver Coaching — Real-time alerts, scorecards, insurance savings (avg 18%).
4. Data Centralization — Single pane of glass for hybrid/mixed fleets.

Target personas: VP of Operations, Fleet Manager, Director of Safety & Compliance, CFO.
Target industries: Trucking/LTL, Construction, Oil & Gas, Public Works, Distribution/Logistics.
`.trim();

// ─── SSE helper ───────────────────────────────────────────────────────────────
function sseWrite(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ─── Web tools ────────────────────────────────────────────────────────────────
const SEARCH_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for current information about companies, news, fleet operations, or any topic.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_fetch',
      description: 'Fetch and read the text content of a specific web page URL.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Full URL to fetch (must start with http:// or https://)' },
        },
        required: ['url'],
      },
    },
  },
];

async function executeWebSearch(query) {
  try {
    const params = new URLSearchParams({ q: query });
    const res = await fetch(`https://lite.duckduckgo.com/lite/?${params}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    // DDG lite uses redirect URLs — extract real URL from uddg param, title from result-link text
    const urlMatches  = [...html.matchAll(/href="\/\/duckduckgo\.com\/l\/\?uddg=([^&"]+)/g)].slice(0, 7);
    const titleMatches = [...html.matchAll(/class='result-link'>([^<]+)<\/a>/g)].slice(0, 7);
    const snippets    = [...html.matchAll(/class='result-snippet'>(.+?)<\/td>/gs)].slice(0, 7);

    const results = urlMatches.map((m, i) => ({
      title:   titleMatches[i]?.[1]?.trim() || `Result ${i + 1}`,
      url:     decodeURIComponent(m[1]),
      snippet: snippets[i]?.[1]?.replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'").trim() || '',
    })).filter(r => r.url.startsWith('http'));

    if (results.length === 0) {
      return JSON.stringify([{ info: `No results for "${query}". Use web_fetch on a known URL instead.` }]);
    }
    return JSON.stringify(results);
  } catch (err) {
    return JSON.stringify([{ error: `Search failed: ${err.message}` }]);
  }
}

async function executeWebFetch(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return `Error: HTTP ${res.status} for ${url}`;
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 6000);
    return text || 'Page fetched but no readable text content found.';
  } catch (err) {
    return `Error fetching ${url}: ${err.message}`;
  }
}

// Agentic tool loop — runs research with web_search + web_fetch, emits SSE tool events
async function runResearch(systemPrompt, userPrompt, sseRes, maxIter = 8) {
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: userPrompt   },
  ];

  for (let i = 0; i < maxIter; i++) {
    const response = await groqWithFallback(g => g.chat.completions.create({
      model: MODEL,
      messages,
      tools: SEARCH_TOOLS,
      tool_choice: 'auto',
      max_tokens: 4096,
      temperature: 0.1,
    }));

    const choice       = response.choices[0];
    const assistantMsg = { role: 'assistant', content: choice.message.content || '' };
    if (choice.message.tool_calls?.length) assistantMsg.tool_calls = choice.message.tool_calls;
    messages.push(assistantMsg);

    if (choice.finish_reason === 'stop' || !choice.message.tool_calls?.length) {
      return choice.message.content || '';
    }

    // Execute each tool call
    for (const toolCall of choice.message.tool_calls) {
      let args;
      try { args = JSON.parse(toolCall.function.arguments); } catch { args = {}; }

      sseWrite(sseRes, 'tool', { name: toolCall.function.name, input: args });

      let result;
      if      (toolCall.function.name === 'web_search') result = await executeWebSearch(args.query);
      else if (toolCall.function.name === 'web_fetch')  result = await executeWebFetch(args.url);
      else                                               result = 'Unknown tool';

      messages.push({ role: 'tool', tool_call_id: toolCall.id, content: result });
    }
  }

  // Final call without tools if max iterations hit
  const final = await groqWithFallback(g => g.chat.completions.create({
    model:       MODEL,
    messages,
    max_tokens:  4096,
    temperature: 0.1,
  }));
  return final.choices[0].message.content || '';
}

// Streaming generation — no tools, streams tokens as SSE events
async function streamGeneration(systemPrompt, userPrompt, sseRes, sseEvent, maxTokens = 4096) {
  const stream = await groqWithFallback(g => g.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt   },
    ],
    stream:      true,
    max_tokens:  maxTokens,
    temperature: 0.4,
  }));

  let fullText = '';
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content || '';
    if (text) {
      fullText += text;
      sseWrite(sseRes, sseEvent, { chunk: text });
    }
  }
  return fullText;
}

// ─── POST /api/generate ───────────────────────────────────────────────────────
app.post('/api/generate', async (req, res) => {
  const { linkedinUrl, websiteUrl, companyName } = req.body;

  if (!websiteUrl && !companyName) {
    return res.status(400).json({ error: 'Provide at least a websiteUrl or companyName.' });
  }

  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();

  try {
    // ── Phase 1: NotebookLM product intel ────────────────────────────────
    let notebooklmContext = '';
    if (nlmReady()) {
      sseWrite(res, 'phase', { phase: 1, label: 'Product Intelligence', status: 'start' });
      try {
        const nlmResult = await getCompanyIntelFromNotebooks(companyName || websiteUrl || '');
        if (nlmResult) {
          notebooklmContext = nlmResult;
          sseWrite(res, 'phase', { phase: 1, label: 'Product Intelligence', status: 'complete' });
        } else {
          sseWrite(res, 'phase', { phase: 1, label: 'Product Intelligence', status: 'skip' });
        }
      } catch {
        sseWrite(res, 'phase', { phase: 1, label: 'Product Intelligence', status: 'skip' });
      }
    } else {
      sseWrite(res, 'phase', { phase: 1, label: 'Product Intelligence', status: 'skip' });
    }

    // ── Phase 1.5: LinkedIn MCP Intelligence ────────────────────────────
    let linkedinContext = '';
    if (linkedinReady() && linkedinUrl) {
      sseWrite(res, 'phase', { phase: 1.5, label: 'LinkedIn Intelligence', status: 'start' });
      try {
        // We'll try to fetch company data if it looks like a company, but linkedinUrl could be a person.
        // For simplicity, we try fetching whatever the URL points to. We can try company first, if error try person.
        let linkedinData = await getLinkedInCompanyData(linkedinUrl);
        let type = 'Company';
        
        // If no company data or it contains an error indicating it's not a company
        if (!linkedinData || !linkedinData.profile || typeof linkedinData.profile === 'string') {
           linkedinData = await getLinkedInPersonData(linkedinUrl);
           type = 'Person/Contact';
        }
        
        if (linkedinData && linkedinData.profile && typeof linkedinData.profile !== 'string') {
          linkedinContext = `LINKEDIN DATA (${type}):\nProfile Info:\n${JSON.stringify(linkedinData.profile, null, 2)}\n\nRecent Posts:\n${JSON.stringify(linkedinData.posts, null, 2)}`;
          sseWrite(res, 'phase', { phase: 1.5, label: 'LinkedIn Intelligence', status: 'complete' });
        } else {
          sseWrite(res, 'phase', { phase: 1.5, label: 'LinkedIn Intelligence', status: 'skip' });
        }
      } catch (e) {
        console.error('[LinkedIn Phase Error]:', e);
        sseWrite(res, 'phase', { phase: 1.5, label: 'LinkedIn Intelligence', status: 'skip' });
      }
    } else {
      sseWrite(res, 'phase', { phase: 1.5, label: 'LinkedIn Intelligence', status: 'skip' });
    }

    // ── Phase 2: Web Research ─────────────────────────────────────────────
    sseWrite(res, 'phase', { phase: 2, label: 'Prospect Research', status: 'start' });

    const researchSystem = `You are an elite B2B sales intelligence analyst for Zenduit, a fleet telematics company.
Use web_search and web_fetch aggressively to build deep sales intelligence. Always fetch the actual company website.
For contact discovery: search LinkedIn by name+title, fetch /about and /team pages, and construct email guesses from the domain pattern. Never output "Unknown" when you can make a reasonable inference or guess.
After all research, return ONLY a valid JSON object — no markdown, no explanation, just the JSON.`;

    const researchPrompt = `
TARGET COMPANY:
- Website: ${websiteUrl || 'unknown'}
- LinkedIn URL: ${linkedinUrl || 'not provided'}
- Company Name: ${companyName || 'unknown (infer from website)'}

ZENDUIT CONTEXT:
${ZENDUIT_CONTEXT}
${notebooklmContext ? `\nINTERNAL SALES INTELLIGENCE (from Zenduit NotebookLM database):\n${notebooklmContext}` : ''}
${linkedinContext ? `\n${linkedinContext}` : ''}

Research this company thoroughly using web_search and web_fetch. Follow ALL these steps:

1. WEBSITE: Fetch their main website to understand their business, fleet/transportation operations, and service areas.

2. LINKEDIN SIGNALS:
   ${linkedinContext ? `- You already have deep LinkedIn structured data above. Review the extracted profile info and posts.` : (linkedinUrl ? `- Fetch this LinkedIn URL: ${linkedinUrl} — extract recent posts, announcements.` : `- Search "${companyName || 'the company'} site:linkedin.com" to find their LinkedIn page.`)}
   - Synthesize hiring signals, what they're talking about publicly, and fleet size indications from the data.

3. RECENT NEWS & TRIGGERS:
   - Search "${companyName || 'the company'} press release OR expansion OR acquisition OR funding 2025 2026".
   - Search "${companyName || 'the company'} fleet OR logistics OR driver OR vehicle news 2025".

4. HIRING SIGNALS (fleet growth indicator):
   - Search "${companyName || 'the company'} hiring driver OR fleet manager OR logistics OR dispatcher".

5. CURRENT VENDORS & DISPLACEMENT ANGLE:
   - Search "${companyName || 'the company'} Samsara OR Geotab OR Verizon Connect OR Lytx OR Motive fleet telematics".
   - Identify what vendor they use now and what specific gap Zenduit could fill.

6. INDUSTRY TRENDS:
   - Search "${companyName ? (companyName + ' industry') : 'fleet'} telematics trends 2025 2026" for 2-3 relevant macro trends.

7. DECISION MAKER & CONTACT — this is critical, do all of these:
   a) Search "${companyName || 'the company'} VP Operations OR Fleet Manager OR Director of Safety OR Director of Logistics site:linkedin.com" — find a real person's name and title.
   b) Search "${companyName || 'the company'} "fleet manager" OR "VP operations" OR "director of logistics" contact" — look for a name in results.
   c) Fetch the company website's /about, /team, /contact, or /leadership page if it exists — extract any staff names and titles.
   d) Search "${companyName || 'the company'} "fleet" OR "operations" email" to find any email contacts.
   e) Once you have a name, guess the email using common patterns: firstname@domain.com, firstname.lastname@domain.com, flastname@domain.com — use the company's website domain.
   f) Search "${companyName || 'the company'} phone number" or fetch their /contact page for a direct line.
   g) Search "${companyName || 'the company'} telematics OR GPS tracking OR fleet management platform" to identify what system they use today.
   h) Identify the types of vehicles/assets they operate (trucks, vans, trailers, equipment, buses, etc.) from their website or news.

   IMPORTANT: Never output "Unknown" for contactName if you found any name at all. Always make a best guess. If you can't find an exact email, construct the most likely one from their domain. If you find a general company phone, use it.

Return ONLY this JSON (no markdown fences):
{
  "companyName": string,
  "industry": string,
  "hq": string,
  "employeeCount": string,
  "fleetSize": string,
  "summary": string,
  "recentNews": [{ "headline": string, "relevance": string }],
  "painPoints": [string],
  "competitors": [string],
  "productMatches": [{ "product": string, "reason": string, "value": string }],
  "prospectContext": string,
  "focus": string,
  "topProduct": string,
  "topPainPoint": string,
  "recentEvent": string,
  "score": number,
  "linkedinSignals": [string],
  "personSignals": [string],
  "industryTrends": [string],
  "hiringSignals": string,
  "fundingOrExpansion": string,
  "displacementAngle": string,
  "decisionMakerHint": string,
  "contactName": string,
  "contactTitle": string,
  "contactEmail": string,
  "contactPhone": string,
  "contactRoleSummary": string,
  "currentFleetPlatform": string,
  "trackableAssets": [string]
}`.trim();

    let intel = {};
    const phase0Text = await runResearch(researchSystem, researchPrompt, res);

    try {
      const jsonMatch = phase0Text.match(/\{[\s\S]*\}/);
      if (jsonMatch) intel = JSON.parse(jsonMatch[0]);
    } catch {
      intel = { companyName: companyName || 'Unknown', summary: phase0Text.slice(0, 500) };
    }

    sseWrite(res, 'phase', { phase: 2, label: 'Prospect Research', status: 'complete', data: intel });

    // ── Phase 3: Strategy Generation ──────────────────────────────────────
    sseWrite(res, 'phase', { phase: 3, label: 'Strategy Generation', status: 'start' });

    // Sanitize intel values — treat "Unknown"/"N/A"/empty as missing
    const clean = (v, fallback = null) => {
      if (!v) return fallback;
      const s = String(v).trim();
      if (!s || s.toLowerCase() === 'unknown' || s.toLowerCase() === 'n/a' || s.toLowerCase() === 'none') return fallback;
      return s;
    };
    const cleanArr = (a, fallback = []) => Array.isArray(a) ? a.filter(v => clean(v)) : fallback;

    const companyContext = `
COMPANY: ${intel.companyName || companyName}
Industry: ${clean(intel.industry, 'Fleet Operations')}
Fleet Size: ${clean(intel.fleetSize, 'enterprise-scale')}
HQ: ${clean(intel.hq, 'North America')}
Top Pain Point: ${clean(intel.topPainPoint, 'operational efficiency and fleet visibility')}
Recent Event: ${clean(intel.recentEvent) || clean(intel.fundingOrExpansion) || clean((intel.linkedinSignals || [])[0]) || 'active fleet operations'}
Best Fit Product: ${clean(intel.topProduct, 'ZenduONE')}
Current Vendors: ${cleanArr(intel.competitors).join(', ') || 'not identified — assume competitive displacement opportunity'}
LinkedIn Signals: ${cleanArr(intel.linkedinSignals).slice(0, 3).join(' | ') || 'no direct signals — use industry triggers'}
Person Signals: ${cleanArr(intel.personSignals).slice(0, 2).join(' | ') || 'none'}
Industry Trends: ${cleanArr(intel.industryTrends).slice(0, 2).join(' | ') || 'rising fuel costs, ELD compliance, driver retention'}
Hiring Signals: ${clean(intel.hiringSignals, 'none found')}
Funding/Expansion: ${clean(intel.fundingOrExpansion, 'none found')}
Displacement Angle: ${clean(intel.displacementAngle, 'highlight ZenduONE unified platform vs point solutions')}
Decision Maker Hint: ${intel.decisionMakerHint || 'VP Operations or Fleet Manager'}

${linkedinContext ? `\n--- LINKEDIN MCP DETAILED DATA (CRITICAL) ---\nUse the exact recent posts, job titles, and experiences listed below to craft highly specific hooks and scripts:\n${linkedinContext}\n---------------------------------------------` : ''}
    `.trim();

    // Executive Briefing
    sseWrite(res, 'phase', { phase: 3, label: 'Executive Briefing', status: 'generating' });
    const briefingSystem = `You are a Zenduit enterprise sales strategist. Generate detailed, hyper-specific HTML sales briefings. Use only HTML tags — no markdown.`;
    const briefingPrompt = `
${companyContext}

ZENDUIT CONTEXT:
${ZENDUIT_CONTEXT}
${notebooklmContext ? `\nZENDUIT PRODUCT INTELLIGENCE:\n${notebooklmContext.slice(0, 3000)}` : ''}

Generate a comprehensive Executive Briefing as HTML (<h2>, <h3>, <p>, <ul>, <li>, <strong>, <table>, <tr>, <td>, <th> — no markdown).

Sections:
1. <h2>Company Overview</h2> — background, fleet scale, key pain points
2. <h2>Competitive Landscape</h2> — current vendors, gaps, Zenduit's angle
3. <h2>Market Opportunity</h2> — fleet trends 2026, ROI Zenduit can deliver
4. <h2>Key Talking Points</h2> — 5 numbered, actionable openers
5. <h2>Handling Objections</h2> — HTML table: Objection | Zenduit Response (4+ rows)
6. <h2>Recommended Next Steps</h2> — 3 concrete follow-up actions

Be hyper-specific. Use actual Zenduit product details and ROI figures.`.trim();

    let briefingHtml = '';
    briefingHtml = await streamGeneration(briefingSystem, briefingPrompt, res, 'briefing_chunk', 3000);

    // Objection table
    sseWrite(res, 'phase', { phase: 3, label: 'Objection Handling', status: 'generating' });
    const objectionSystem = `You are a Zenduit sales expert. Return only an HTML table, no other text or markdown.`;
    const objectionPrompt = `
Generate a Zenduit objection handling HTML table for ${intel.companyName || companyName}.
Context: ${intel.summary || 'Enterprise fleet operator'}
Pain points: ${(intel.painPoints || []).join(', ')}

Include: current vendor objection, budget/cost, driver camera resistance, installation disruption, plus 2 company-specific ones.
ROI data: 12% idle reduction, 18% insurance savings, 8% fuel savings.

Format: <table><thead><tr><th>Common Objection</th><th>Zenduit Strategic Response</th></tr></thead><tbody>...</tbody></table>
Return only the HTML table.`.trim();

    let objectionsHtml = await streamGeneration(objectionSystem, objectionPrompt, res, 'tool', 1500);

    // 14-Day Sequence
    sseWrite(res, 'phase', { phase: 3, label: '14-Day Sequence', status: 'generating' });
    const sequenceSystem = `You are a Zenduit outbound sales specialist. Return only valid JSON array, no markdown or explanation.`;
    const sequencePrompt = `
Generate a 14-day outbound sequence for ${intel.companyName || companyName}.

${companyContext}

Return JSON array only (no markdown fences):
[{ "day": number, "channel": "LinkedIn"|"Email"|"Call"|"Message", "subject": string|null, "instruction": string }]

Touchpoints: Day 1 (LinkedIn), Day 3 (Email), Day 5 (LinkedIn), Day 7 (Email), Day 10 (Call), Day 14 (Email with offer).
Every instruction must reference this company's specific pain points and recent events.`.trim();

    const sequenceText = await streamGeneration(sequenceSystem, sequencePrompt, res, 'tool', 2000);

    let sequence = [];
    try {
      const arrMatch = sequenceText.match(/\[[\s\S]*\]/);
      if (arrMatch) sequence = JSON.parse(arrMatch[0]);
    } catch {
      sequence = [
        { day: 1,  channel: 'LinkedIn', instruction: `Connect with ${intel.companyName} decision-maker.` },
        { day: 3,  channel: 'Email',    instruction: `Value-led email on ${intel.topPainPoint || 'fleet efficiency'}.` },
        { day: 7,  channel: 'Call',     instruction: 'Follow-up call offering a custom fleet audit.' },
        { day: 14, channel: 'Email',    instruction: 'Final email with ROI calculator and case study.' },
      ];
    }

    // Outreach Scripts
    sseWrite(res, 'phase', { phase: 3, label: 'Outreach Scripts', status: 'generating' });
    const scriptsSystem = `You are a world-class B2B outbound sales copywriter specialising in fleet telematics. You write hyper-personalised, conversion-focused scripts grounded in real research signals. You follow proven copywriting frameworks (AIDA, Pattern Interrupt, Permission Opener). Return only valid JSON array — no markdown, no explanation.`;

    const scriptsPrompt = `
Generate 5 outreach scripts for ${intel.companyName || companyName}.

PROSPECT INTELLIGENCE:
${companyContext}

ZENDUIT PRODUCT KNOWLEDGE (use specific features, modules, ROI stats below in your scripts):
${notebooklmContext ? notebooklmContext.slice(0, 4000) : ZENDUIT_CONTEXT}

RULES — every script MUST follow these:
- NEVER open with "I'd love to connect", "I hope this finds you well", or generic openers
- ALWAYS open with a specific signal from the research: a LinkedIn post, recent news, hiring signal, or expansion event
- Reference a named Zenduit product/feature tied directly to their top pain point
- Include at least one ROI data point (12% idle reduction, 18% insurance savings, or 8% fuel savings)
- The ask must be low-friction (15 min call, quick question, not "schedule a demo")

Return this exact JSON array (5 items, no markdown fences):
[
  {
    "type": "LinkedIn Connection",
    "subject": null,
    "body": "Max 300 chars. Pattern Interrupt framework. Lead with one specific insight about their recent activity or a fleet challenge they publicly face — NOT a generic opener. No pitch. No ask. Just a relevant observation that makes them want to accept.",
    "framework": "Pattern Interrupt",
    "tip": "Personalisation tip: what the sender should verify or add before hitting send",
    "openingSignal": "1 sentence describing the SPECIFIC real-world signal used to open this script (e.g. 'Their recent LinkedIn post about expanding their Texas fleet' or 'Their Q1 2025 press release about acquiring 50 new trucks'). Never write 'Unknown' or 'Signal used'."
  },
  {
    "type": "LinkedIn Follow-up",
    "subject": null,
    "body": "Sent 1-2 days after connection accepted. Under 200 words. Reference something specific from their profile or a recent post. One sentence bridge to how Zenduit solves a named pain. Soft CTA: 'Would it be worth a quick 15-min chat?'",
    "framework": "Trigger + Value",
    "tip": "Personalisation tip for sender",
    "openingSignal": "1 sentence: the specific profile detail or post that was referenced to open this message"
  },
  {
    "type": "Cold Email #1",
    "subject": "Curiosity hook subject line tied to their recent event or news — not generic, not 'Fleet Efficiency for [Company]'",
    "body": "AIDA framework. Attention: open with their specific news/LinkedIn signal/expansion — 1-2 sentences that prove you researched them. Interest: frame their top pain point as a cost or risk with a specific number if possible. Desire: name the specific Zenduit product/feature, cite an ROI stat, mention a similar company win. Action: one low-friction ask — '15 min to show you how [similar company] reduced [pain] by [%]?' Use \\n for paragraph breaks.",
    "framework": "AIDA",
    "tip": "Personalisation tip for sender",
    "openingSignal": "1 sentence: the specific news/event/signal that opens the email"
  },
  {
    "type": "Cold Email #2",
    "subject": "Re: [mirror the Cold Email #1 subject]",
    "body": "Re-engage follow-up, new angle. Under 150 words. Open with a different hook — a new pain point, industry trend, or brief case study. Slightly more direct CTA. Use \\n for paragraph breaks.",
    "framework": "New Angle",
    "tip": "Personalisation tip for sender",
    "openingSignal": "1 sentence: the new angle or industry trend used to re-open the conversation"
  },
  {
    "type": "Cold Call Script",
    "subject": null,
    "body": "Full branching cold call script with these labeled sections:\\n\\nPERMISSION OPENER: [ask if they have 30 seconds, reference a specific trigger]\\n\\nTRIGGER HOOK: [mention the specific news/LinkedIn signal/hiring that prompted the call]\\n\\nPAIN QUESTION: [open-ended question about their top pain point — never yes/no]\\n\\nVALUE BRIDGE: [name the specific Zenduit product + one ROI stat]\\n\\nSOCIAL PROOF: [brief mention of a similar company or fleet type]\\n\\nASK: [low-friction next step]\\n\\nOBJECTION 1 — If they say 'We already have [${clean((intel.competitors || [])[0], 'a competitor')}]':\\n[pivot: acknowledge, find the gap, re-engage]\\n\\nOBJECTION 2 — If they say 'Not the right time':\\n[pivot: plant a seed for future, get a timing commitment]",
    "framework": "Permission Opener",
    "tip": "Personalisation tip for sender",
    "openingSignal": "1 sentence: the specific trigger referenced in the permission opener"
  }
]`.trim();

    const scriptsText = await streamGeneration(scriptsSystem, scriptsPrompt, res, 'tool', 3500);

    let scripts = [];
    try {
      const arrMatch = scriptsText.match(/\[[\s\S]*\]/);
      if (arrMatch) scripts = JSON.parse(arrMatch[0]);
    } catch {
      const co = intel.companyName || companyName || 'your company';
      const signal = intel.recentEvent || intel.fundingOrExpansion || 'your recent fleet expansion';
      const pain  = intel.topPainPoint || 'fleet efficiency';
      const prod  = intel.topProduct || 'ZenduONE';
      const vendor = (intel.competitors || [])[0] || 'your current vendor';
      scripts = [
        { type: 'LinkedIn Connection', subject: null, framework: 'Pattern Interrupt', openingSignal: signal,
          tip: 'Verify the signal is recent before sending.',
          body: `Noticed ${co} recently ${signal}. Most fleet operators at your scale hit a wall with driver safety data being siloed from operations. Curious if that's a challenge you're navigating.` },
        { type: 'LinkedIn Follow-up', subject: null, framework: 'Trigger + Value', openingSignal: signal,
          tip: 'Reference something specific from their recent posts.',
          body: `Thanks for connecting. I came across your work on ${pain} — we help fleets like ${co} cut idle time by 12% and reduce insurance costs 18% with ${prod}. Would a quick 15-min chat be worth it?` },
        { type: 'Cold Email #1', framework: 'AIDA', openingSignal: signal,
          subject: `${co}'s ${signal} — a fleet angle`,
          tip: 'Personalise the subject line with the exact news headline.',
          body: `Hi [Name],\n\nSaw that ${co} recently ${signal} — congrats on the growth.\n\nAt that scale, fleet visibility gaps tend to compound fast — idle time, driver coaching, compliance exposure.\n\nWe help operators like you close those gaps with ${prod}: 12% idle reduction, 18% insurance savings, unified telematics in one platform.\n\n15 min to show you how a similar ${intel.industry || 'fleet'} operator cut costs by 18%?\n\n[Your Name]` },
        { type: 'Cold Email #2', framework: 'New Angle',
          subject: `Re: ${co}'s fleet — one more angle`,
          openingSignal: 'Industry trend', tip: 'Add a specific industry stat relevant to their sector.',
          body: `Hi [Name],\n\nFollowing up with a different angle: fleet telematics adoption in ${intel.industry || 'your industry'} is accelerating — companies that consolidate GPS, dashcam, and maintenance onto one platform are seeing 8% fuel savings on average.\n\n${co} is at the right size to see that ROI quickly. Worth a 15-min look?\n\n[Your Name]` },
        { type: 'Cold Call Script', subject: null, framework: 'Permission Opener', openingSignal: signal,
          tip: 'Practice the objection pivots before the call.',
          body: `PERMISSION OPENER: "Hi [Name], this is [Your Name] from Zenduit — do you have 30 seconds? I'll be quick."\n\nTRIGGER HOOK: "I noticed ${co} recently ${signal} — that's what prompted my call."\n\nPAIN QUESTION: "When your fleet is growing, where do you feel the biggest operational drag — is it driver behaviour, fuel, or keeping compliance up?"\n\nVALUE BRIDGE: "We built ${prod} specifically for that — GPS, dashcam AI coaching, and maintenance in one platform. Clients typically see 12% idle reduction in 90 days."\n\nSOCIAL PROOF: "A similar ${intel.industry || 'fleet'} operator reduced insurance costs 18% in the first year."\n\nASK: "Would 15 minutes to walk through what that looks like for ${co} make sense this week?"\n\nOBJECTION 1 — If they say 'We already have ${vendor}':\n"I figured — most companies we talk to came from ${vendor}. The gap they kept hitting was data silos — GPS in one system, cameras in another, no unified view. Is that something you've run into?"\n\nOBJECTION 2 — If they say 'Not the right time':\n"Totally fair. I'm not trying to sell today — just curious, when you do evaluate fleet tools next, what would need to be different from what ${vendor} is delivering now?"` },
      ];
    }

    sseWrite(res, 'phase', { phase: 3, label: 'Strategy Generation', status: 'complete' });
    sseWrite(res, 'complete', {
      intel,
      briefing:    briefingHtml,
      objections:  objectionsHtml,
      sequence,
      scripts,
      companyName: intel.companyName || companyName || 'Target Company',
    });
    res.end();

  } catch (err) {
    console.error('[/api/generate] Error:', err);
    sseWrite(res, 'error', { message: err.message || 'Research pipeline failed.' });
    res.end();
  }
});

// ─── POST /api/bulk ───────────────────────────────────────────────────────────
app.post('/api/bulk', async (req, res) => {
  const { prospects } = req.body;
  if (!Array.isArray(prospects) || prospects.length === 0) {
    return res.status(400).json({ error: 'Provide a non-empty prospects array.' });
  }

  const results = [];
  for (const prospect of prospects.slice(0, 20)) {
    const { companyName, websiteUrl, linkedinUrl } = prospect;
    try {
      const response = await groqWithFallback(g => g.chat.completions.create({
        model: MODEL,
        messages: [{
          role: 'system',
          content: 'You are a B2B fleet sales analyst for Zenduit. Return only valid JSON, no markdown.',
        }, {
          role: 'user',
          content: `
Research this company for Zenduit fleet sales:
- Company: ${companyName || 'unknown'}
- Website: ${websiteUrl || 'unknown'}
- LinkedIn: ${linkedinUrl || 'none'}

${ZENDUIT_CONTEXT}

Return compact JSON only (no markdown):
{ "companyName": string, "industry": string, "fleetSize": string, "topPainPoint": string, "topProduct": string, "score": number (1-10), "reason": string }
          `.trim(),
        }],
        max_tokens:  512,
        temperature: 0.2,
      }));
      const text      = response.choices[0].message.content || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const data      = jsonMatch ? JSON.parse(jsonMatch[0]) : { companyName, score: 5, reason: 'Research pending' };
      results.push({ ...prospect, ...data, status: 'success' });
    } catch (err) {
      results.push({ ...prospect, status: 'error', reason: err.message });
    }
  }
  res.json({ results });
});

// ─── Library persistence (server-side JSON file) ──────────────────────────────
const LIBRARY_FILE = path.join(process.cwd(), 'library.json');

const readLibrary = () => {
  try { return JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf8')); }
  catch { return []; }
};

const writeLibrary = (data) => {
  fs.writeFileSync(LIBRARY_FILE, JSON.stringify(data, null, 2));
};

app.get('/api/library', (req, res) => {
  res.json(readLibrary());
});

app.post('/api/library', (req, res) => {
  const { library } = req.body;
  if (!Array.isArray(library)) return res.status(400).json({ error: 'library must be an array' });
  writeLibrary(library);
  res.json({ ok: true, count: library.length });
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', model: 'groq/llama-3.3-70b', notebooklm: nlmReady(), linkedin: linkedinReady() });
});

app.listen(PORT, async () => {
  console.log(`\n🚀 Zenduit Intel Backend running on http://localhost:${PORT}`);
  console.log(`   Model: Groq llama-3.3-70b-versatile + DuckDuckGo web search\n`);
  bootstrapNotebookLM().catch(err => console.warn('[NotebookLM] Bootstrap failed:', err.message));
  bootstrapLinkedInMCP().catch(err => console.warn('[LinkedIn] Bootstrap failed:', err.message));
});
