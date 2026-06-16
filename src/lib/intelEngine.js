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
    let activeTools  = [];
    let accBriefing  = '';
    let capturedIntel = null;
    let completed    = false;

    const cancel = streamGenerate(params, {
      onPhase: (data) => {
        // Capture website intel from phase 1 complete event for partial recovery
        if (data.phase === 1 && data.status === 'complete' && data.data) {
          capturedIntel = data.data;
        }
        onProgress?.({
          type:   'phase',
          phase:  data.phase,
          label:  data.label,
          status: data.status,
          data:   data.data,
        });
      },
      onTool: (name) => {
        activeTools.push(name);
        onProgress?.({ type: 'tool', name, activeTools: [...activeTools] });
      },
      onToolResult:      (data) => onProgress?.({ type: 'tool_result', ...data }),
      onResearchSummary: (data) => onProgress?.({ type: 'research_summary', ...data }),
      onGenerationInput: (data) => onProgress?.({ type: 'generation_input', ...data }),
      onBriefingChunk: (chunk) => {
        accBriefing += chunk || '';
        onProgress?.({ type: 'briefing_chunk', chunk });
      },
      onComplete: (result) => {
        completed = true;
        resolve(result);
      },
      onStreamEnd: () => {
        if (completed) return;
        // Stream ended without a complete event — surface whatever was accumulated
        if (accBriefing || capturedIntel) {
          resolve({
            briefing:    accBriefing,
            objections:  '',
            sequence:    [],
            scripts:     [],
            variants:    [],
            companyName: capturedIntel?.companyName || params.companyName || '',
            intel:       capturedIntel || {},
            linkedinIntel: {},
            partial:     true,
          });
        } else {
          reject(new Error('Pipeline did not complete. Please try again.'));
        }
      },
      onError: (message) => {
        reject(new Error(message));
      },
    });

    cancel._cancel = cancel;
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
