/**
 * API client — connects the React frontend to the Express/Claude backend.
 * Uses SSE streaming for real-time phase updates during research.
 */

import { getAuthToken, clearAuthToken } from './auth.js';

const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

function authHeaders(extra = {}) {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}`, ...extra } : { ...extra };
}

async function authFetch(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: authHeaders(opts.headers),
  });
  if (res.status === 401) {
    clearAuthToken();
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  return res;
}

/**
 * Stream intelligence generation for a prospect.
 * Calls backend which runs MBLM Phase 0 (web research) + Phase 3 (strategy gen).
 *
 * @param {object} params - { linkedinUrl, websiteUrl, companyName }
 * @param {object} callbacks - { onPhase, onText, onTool, onBriefingChunk, onComplete, onError }
 */
export const streamGenerate = (params, callbacks) => {
  const {
    onPhase, onText, onTool, onBriefingChunk, onComplete, onStreamEnd, onError,
    onToolResult, onResearchSummary, onGenerationInput,
  } = callbacks;

  const ctrl = new AbortController();

  fetch(`${API_BASE}/generate`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(params),
    signal: ctrl.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        if (res.status === 401) {
          clearAuthToken();
          window.location.href = '/login';
          return;
        }
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        onError?.(err.error || 'Request failed');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // SSE messages are separated by double newline
          const parts = buffer.split('\n\n');
          buffer = parts.pop(); // last part may be incomplete

          for (const part of parts) {
            const lines = part.split('\n');
            let eventType = 'message';
            let data = '';

            for (const line of lines) {
              if (line.startsWith('event: ')) eventType = line.slice(7).trim();
              if (line.startsWith('data: ')) data = line.slice(6).trim();
            }

            if (!data) continue;

            try {
              const parsed = JSON.parse(data);
              switch (eventType) {
                case 'phase':            onPhase?.(parsed); break;
                case 'text':             onText?.(parsed.chunk); break;
                case 'tool':             onTool?.(parsed.name); break;
                case 'tool_result':      onToolResult?.(parsed); break;
                case 'research_summary': onResearchSummary?.(parsed); break;
                case 'generation_input': onGenerationInput?.(parsed); break;
                case 'briefing_chunk':   onBriefingChunk?.(parsed.chunk); break;
                case 'complete':         onComplete?.(parsed); break;
                case 'error':            onError?.(parsed.message); break;
              }
            } catch {
              // ignore parse errors on individual chunks
            }
          }
        }
      } finally {
        // Always fire — whether stream ended cleanly, dropped, or errored
        onStreamEnd?.();
      }
    })
    .catch((err) => {
      if (err.name !== 'AbortError') onError?.(err.message);
      else onStreamEnd?.();
    });

  return () => ctrl.abort();
};

/**
 * Bulk process an array of prospects.
 * @param {Array} prospects - [{ companyName, websiteUrl, linkedinUrl }]
 * @returns {Promise<Array>} results
 */
export const bulkProcess = async (prospects) => {
  const res = await authFetch(`${API_BASE}/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prospects }),
  });
  if (!res.ok) throw new Error('Bulk processing failed');
  const data = await res.json();
  return data.results;
};

/**
 * Check if the backend is reachable and API key is configured.
 */
export const checkHealth = async () => {
  try {
    const res = await fetch(`${API_BASE}/health`);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
};

/**
 * Load the library from the server (persists across browser cache clears).
 */
export const fetchLibrary = async () => {
  try {
    const res = await authFetch(`${API_BASE}/library`);
    return res.ok ? await res.json() : [];
  } catch {
    return [];
  }
};

/**
 * Save the full library to the server.
 */
export const saveLibrary = async (library) => {
  try {
    await authFetch(`${API_BASE}/library`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ library }),
    });
  } catch {
    // silently fail — localStorage is the fallback
  }
};

// ─── Closed-loop outcome tracking ─────────────────────────────────────────────

/** Fetch all logged outcomes (most recent first). */
export const fetchOutcomes = async () => {
  try {
    const res = await authFetch(`${API_BASE}/outcomes`);
    return res.ok ? await res.json() : [];
  } catch {
    return [];
  }
};

/** Fetch aggregated campaign stats. */
export const fetchOutcomeStats = async () => {
  try {
    const res = await authFetch(`${API_BASE}/outcomes/stats`);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
};

/** Create or update an outcome. Pass an `id` to update an existing record. */
export const saveOutcome = async (outcome) => {
  const res = await authFetch(`${API_BASE}/outcomes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(outcome),
  });
  if (!res.ok) throw new Error('Failed to save outcome');
  return res.json();
};

/** Delete an outcome by id. */
export const deleteOutcome = async (id) => {
  const res = await authFetch(`${API_BASE}/outcomes/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete outcome');
  return res.json();
};

/** Classify a prospect's reply → { status, reason, suggestedNextStep }. */
export const classifyReply = async ({ reply, companyName = '', context = '' }) => {
  const res = await authFetch(`${API_BASE}/classify-reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reply, companyName, context }),
  });
  if (!res.ok) throw new Error('Failed to classify reply');
  return res.json();
};

// ─── SDR Funnel additions ──────────────────────────────────────────────────────

/** Save a single library entry (triggers email + ClickUp if assignedRep set). */
export const saveLibraryEntry = async (entry) => {
  try {
    const res = await authFetch(`${API_BASE}/library/entry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
};

/** Fetch a single lead by ID (for the /lead/:id share page — public, no auth). */
export const fetchLead = async (id) => {
  const res = await fetch(`${API_BASE}/library/${id}`);
  if (!res.ok) throw new Error(res.status === 404 ? 'Lead not found' : 'Failed to load lead');
  return res.json();
};

/** Fetch all reps from the ClickUp member directory. */
export const fetchReps = async () => {
  try {
    const res = await authFetch(`${API_BASE}/reps`);
    return res.ok ? await res.json() : [];
  } catch {
    return [];
  }
};

/** Fetch leaderboard (period: 'all' | 'weekly' | 'monthly'). */
export const fetchLeaderboard = async (period = 'all') => {
  try {
    const res = await authFetch(`${API_BASE}/leaderboard?period=${period}`);
    return res.ok ? await res.json() : [];
  } catch {
    return [];
  }
};

/** Fetch all saved settings (secrets return null value, only configured:bool). */
export const fetchSettings = async () => {
  try {
    const res = await authFetch(`${API_BASE}/settings`);
    return res.ok ? await res.json() : {};
  } catch {
    return {};
  }
};

/** Save settings object (only non-empty values are persisted). */
export const saveSettings = async (data) => {
  const res = await authFetch(`${API_BASE}/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to save settings');
  return res.json();
};
