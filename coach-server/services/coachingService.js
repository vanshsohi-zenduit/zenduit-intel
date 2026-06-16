import { GoogleGenerativeAI } from "@google/generative-ai";

// Lazy-initialized so it reads the env var after dotenv has run (ESM hoisting)
let _genAI = null;
function getGenAI() {
  if (!_genAI) _genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || process.env.GOOGLE_AI_API_KEY);
  return _genAI;
}

export async function* streamChatAnswer(question, prospectContext = "") {
  const prospectSection = prospectContext
    ? `\nPROSPECT INTEL (from pre-call research):\n${prospectContext}\n`
    : "";

  const systemPrompt = `You are an AI sales assistant for a rep at Zenduit, a fleet management company (GPS tracking, vehicle telematics, dispatch software).
${prospectSection}
Answer the rep's question concisely and directly. Use bullet points when listing options or steps.
Limit to 3–5 sentences or 4 bullets maximum. Be actionable.`;

  try {
    const model = getGenAI().getGenerativeModel({
      model: "gemini-3.5-flash",
      systemInstruction: systemPrompt,
      generationConfig: { temperature: 0.3 },
    });
    const result = await model.generateContentStream(question);
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) yield text;
    }
  } catch (err) {
    console.error("[Gemini] Chat error:", err.message);
    yield "⚠ Coaching temporarily unavailable. Trust your training.";
  }
}

async function classifySpeaker(transcript, company) {
  try {
    const model = getGenAI().getGenerativeModel({
      model: "gemini-3.5-flash",
      generationConfig: { maxOutputTokens: 5, temperature: 0 },
    });
    const result = await model.generateContent(
      `A live sales call is in progress. The internal sales rep works for ${company}, a fleet management company (GPS tracking, vehicle telematics, dispatch software).

Transcript segment: "${transcript}"

Is this the SALES REP speaking or the CUSTOMER/PROSPECT speaking?
Reply with exactly one word: REP or CUSTOMER`
    );
    const raw = result.response.text().trim().toUpperCase().replace(/[^A-Z]/g, "");
    console.log(`[Coach] Speaker: ${raw}`);
    return raw === "REP" ? "REP" : "CUSTOMER";
  } catch (err) {
    console.error("[Coach] Speaker classification error (defaulting to CUSTOMER):", err.message);
    return "CUSTOMER";
  }
}

/**
 * @param {string} transcriptSnippet
 * @param {string} mcpContext
 * @param {string} company
 * @param {string} prospectContext - Pre-call research summary from Intel pipeline
 */
export async function* streamCoachingSuggestions(transcriptSnippet, mcpContext, company = "Zenduit", prospectContext = "") {
  const speaker = await classifySpeaker(transcriptSnippet, company);

  if (speaker === "REP") {
    yield "__REP__";
    return;
  }

  const prospectSection = prospectContext
    ? `\nPROSPECT INTEL (from pre-call research):\n${prospectContext}\n`
    : "";

  const systemPrompt = `You are a real-time AI Sales Coach for a sales rep at ${company}, a fleet management company specialising in GPS tracking, vehicle telematics, and dispatch software.

The customer/prospect just spoke. Provide immediate, action-oriented guidance to help the rep respond.
${prospectSection}
DYNAMIC REAL-TIME STRATEGY DATA:
${mcpContext}

Format as exactly 3 bullet points. Each bullet: one bold opening phrase (3-5 words) followed by one sentence of detail.
Example:
• **Ask about their timeline** — Find out if they have an upcoming contract renewal or compliance deadline.

Limit to 3 bullet points maximum. Be exceptionally concise. Do not prefix with filler statements.`;

  try {
    const model = getGenAI().getGenerativeModel({
      model: "gemini-3.5-flash",
      systemInstruction: systemPrompt,
      generationConfig: { temperature: 0.2 },
    });

    const result = await model.generateContentStream(
      `The prospect said: "${transcriptSnippet}"`
    );

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) yield text;
    }
  } catch (err) {
    console.error("[Gemini] Streaming error:", err.message);
    yield "⚠ Coaching temporarily unavailable. Trust your training.";
  }
}
