import { useState, useCallback, useRef, useEffect } from "react";

export function useChatStream({ chatUrl = "/coach/v1/coach/chat", prospectContext = "" } = {}) {
  const [messages, setMessages]    = useState([]);
  const [isStreaming, setStreaming] = useState(false);

  const abortRef           = useRef(null);
  const prospectContextRef = useRef(prospectContext);
  useEffect(() => { prospectContextRef.current = prospectContext; }, [prospectContext]);

  const sendMessage = useCallback(async (question) => {
    if (!question.trim() || isStreaming) return;

    const userMsg = { id: Date.now(),     role: "user", text: question, streaming: false };
    const aiId    = Date.now() + 1;
    setMessages(prev => [...prev, userMsg, { id: aiId, role: "ai", text: "", streaming: true }]);

    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setStreaming(true);

    try {
      const res = await fetch(chatUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, prospectContext: prospectContextRef.current }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`${res.status}`);

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        setMessages(prev => prev.map(m => m.id === aiId ? { ...m, text: full } : m));
      }
      setMessages(prev => prev.map(m => m.id === aiId ? { ...m, streaming: false } : m));
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("[Chat] Streaming error:", err);
        setMessages(prev => prev.map(m =>
          m.id === aiId
            ? { ...m, text: "⚠ Could not reach coaching server.", streaming: false }
            : m
        ));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [chatUrl, isStreaming]);

  const clearChat = useCallback(() => setMessages([]), []);

  return { messages, isStreaming, sendMessage, clearChat };
}
