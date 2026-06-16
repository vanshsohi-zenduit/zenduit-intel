import { useState, useCallback, useRef, useEffect } from "react";

const DEBOUNCE_MS = 1500;

export function useCoachingStream({
  coachUrl = "/coach/v1/coach/suggest",
  agentId = "agent_default",
  prospectContext = "",
} = {}) {
  const [suggestion, setSuggestion]  = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [history, setHistory]        = useState([]);

  const abortControllerRef = useRef(null);
  const debounceTimerRef   = useRef(null);
  const pendingTextRef     = useRef("");
  // Use ref so _fireRequest closure always reads the latest prospectContext
  const prospectContextRef = useRef(prospectContext);
  useEffect(() => { prospectContextRef.current = prospectContext; }, [prospectContext]);

  const _fireRequest = useCallback(async (transcriptText) => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsStreaming(true);
    setSuggestion("");

    try {
      const response = await fetch(coachUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: transcriptText,
          agentId,
          prospectContext: prospectContextRef.current,
        }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`Backend returned ${response.status}`);

      const reader  = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText  = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
        setSuggestion(fullText);
      }

      if (fullText.trim() && fullText !== "__REP__") {
        setHistory(prev => [
          { id: Date.now(), transcript: transcriptText, suggestion: fullText, timestamp: new Date().toLocaleTimeString() },
          ...prev,
        ].slice(0, 50));
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("[Coach] Streaming error:", err);
        setSuggestion("⚠ Could not reach coaching server. Trust your instincts.");
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, [coachUrl, agentId]);

  const requestSuggestion = useCallback((transcriptText) => {
    if (!transcriptText?.trim()) return;
    pendingTextRef.current = pendingTextRef.current
      ? `${pendingTextRef.current} ${transcriptText}`
      : transcriptText;

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      const text = pendingTextRef.current;
      pendingTextRef.current = "";
      debounceTimerRef.current = null;
      _fireRequest(text);
    }, DEBOUNCE_MS);
  }, [_fireRequest]);

  const clearHistory = useCallback(() => setHistory([]), []);

  return { requestSuggestion, suggestion, isStreaming, history, clearHistory };
}
