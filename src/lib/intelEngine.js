/**
 * Intelligence Engine — MBLM Phase 0 & 2 Implementation
 * Wraps the mcpClient stream into a Promise-based interface for App.jsx
 */
import { streamGenerate } from './mcpClient.js';

/**
 * Run the full research + strategy pipeline for a prospect.
 *
 * @param {object} params - { linkedinUrl, websiteUrl, companyName }
 * @param {function} onProgress - called with progress updates: { phase, label, status, tool }
 * @returns {Promise<object>} Full result: { intel, briefing, objections, sequence, scripts, companyName }
 */
export const runIntelPipeline = (params, onProgress) => {
  return new Promise((resolve, reject) => {
    let activeTools = [];

    const cancel = streamGenerate(params, {
      onPhase: (data) => {
        onProgress?.({
          type: 'phase',
          phase: data.phase,
          label: data.label,
          status: data.status,
          data: data.data,
        });
      },
      onTool: (name) => {
        activeTools.push(name);
        onProgress?.({ type: 'tool', name, activeTools: [...activeTools] });
      },
      onBriefingChunk: (chunk) => {
        onProgress?.({ type: 'briefing_chunk', chunk });
      },
      onComplete: (result) => {
        resolve(result);
      },
      onError: (message) => {
        reject(new Error(message));
      },
    });

    // Attach cancel function to the promise for optional cleanup
    resolve._cancel = cancel;
  });
};

/**
 * Map company intel to Zenduit product overlaps.
 * Used to highlight product-fit cards in the UI.
 */
export const mapProductOverlap = (intel) => {
  if (intel?.productMatches?.length) return intel.productMatches;
  return [
    { product: 'ZenduONE', reason: 'Unified fleet visibility', value: '8% avg fuel savings' },
    { product: 'ZenduCAM', reason: 'Driver safety & coaching', value: '30% reduction in incidents' },
  ];
};
