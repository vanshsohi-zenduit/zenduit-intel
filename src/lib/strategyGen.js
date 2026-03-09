/**
 * MBLM Phase 3 Implementation for Zenduit Outbound Intel
 * Logic for generating structured artifacts and sequences.
 */

export const generateExecutiveBriefing = (intelResults) => {
    return `
# Executive Briefing: ${intelResults.companyName}

## 1. Company Overview
${intelResults.summary || "Summary of company operations and fleet scale."}

## 2. Competitive Landscape
Deep-dive into 2026 industry trends and ${intelResults.companyName}'s position relative to competitors using Geoforce or Samsara.

## 3. Zenduit Value Prop
- **Focus**: ${intelResults.focus || "Operational Efficiency"}
- **Product Match**: ${intelResults.topProduct || "Zenduit Z-Check"}
- **Unique Hook**: Grounded in recent news about ${intelResults.recentEvent || "their new regional distribution center"}.
  `;
};

export const generateObjectionTable = (prospectContext) => {
    return `
| Common Objection | Strategic Response (Zenduit Framework) |
| :--- | :--- |
| "Already have a telematics provider" | "We integrate and enrich existing data streams, providing a single pane of glass for hybrid fleets." |
| "Too expensive" | "Focus on the 12-month ROI through reduction in fuel leakage and unauthorized idling." |
| "Hardware install is a pain" | "Highlight our plug-and-play OBD-II options and mobile-first driver apps." |
  `;
};

export const generate14DaySequence = (persona, intel) => {
    return [
        { day: 1, channel: 'LinkedIn', instruction: 'Send connection request with specific reference to their ${intel.recentPostTopic}.' },
        { day: 3, channel: 'Email', instruction: 'Value-led email focused on ${intel.topPainPoint}. Attach Case Study: Werner Enterprises.' },
        { day: 7, channel: 'LinkedIn', instruction: 'Soft follow-up: Comment on their latest corporate milestone.' },
        { day: 14, channel: 'Call', instruction: 'Closing hook: Offer a custom "Fleet Optimization Audit" based on Phase 2 research.' },
    ];
};
