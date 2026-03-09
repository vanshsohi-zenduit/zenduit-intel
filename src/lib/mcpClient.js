/**
 * API client — connects the React frontend to the Express/Claude backend.
 * Uses SSE streaming for real-time phase updates during research.
 */

const API_BASE = '/api';

/**
 * Stream intelligence generation for a prospect.
 * Calls backend which runs MBLM Phase 0 (web research) + Phase 3 (strategy gen).
 *
 * @param {object} params - { linkedinUrl, websiteUrl, companyName }
 * @param {object} callbacks - { onPhase, onText, onTool, onBriefingChunk, onComplete, onError }
 */
export const streamGenerate = (params, callbacks) => {
  const { onPhase, onText, onTool, onBriefingChunk, onComplete, onError } = callbacks;

  const ctrl = new AbortController();

  fetch(`${API_BASE}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal: ctrl.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        onError?.(err.error || 'Request failed');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

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
              case 'phase':      onPhase?.(parsed); break;
              case 'text':       onText?.(parsed.chunk); break;
              case 'tool':       onTool?.(parsed.name); break;
              case 'briefing_chunk': onBriefingChunk?.(parsed.chunk); break;
              case 'complete':   onComplete?.(parsed); break;
              case 'error':      onError?.(parsed.message); break;
            }
          } catch {
            // ignore parse errors on partial chunks
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== 'AbortError') onError?.(err.message);
    });

  return () => ctrl.abort();
};

/**
 * Bulk process an array of prospects.
 * @param {Array} prospects - [{ companyName, websiteUrl, linkedinUrl }]
 * @returns {Promise<Array>} results
 */
export const bulkProcess = async (prospects) => {
  const res = await fetch(`${API_BASE}/bulk`, {
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
    const res = await fetch(`${API_BASE}/library`);
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
    await fetch(`${API_BASE}/library`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ library }),
    });
  } catch {
    // silently fail — localStorage is the fallback
  }
};
