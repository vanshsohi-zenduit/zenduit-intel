import { useState, useRef, useCallback } from "react";

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition || null;

export function useAudioPipeline({ onTranscript } = {}) {
  const [status, setStatus]   = useState("idle");
  const [error, setError]     = useState(null);
  const recognitionRef        = useRef(null);
  const onTranscriptRef       = useRef(onTranscript);
  onTranscriptRef.current     = onTranscript;

  const startCapture = useCallback(async () => {
    if (!SpeechRecognition) {
      setError("Speech recognition is not supported in this browser. Use Chrome or Edge.");
      setStatus("error");
      return;
    }

    try {
      setError(null);
      setStatus("capturing");

      // Request mic permission explicitly so the browser prompt fires before SR starts
      await navigator.mediaDevices.getUserMedia({ audio: true });

      const recognition = new SpeechRecognition();
      recognition.continuous      = true;
      recognition.interimResults  = true;
      recognition.lang            = "en-US";
      recognition.maxAlternatives = 1;
      recognitionRef.current      = recognition;

      recognition.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const text   = result[0]?.transcript?.trim();
          if (text && onTranscriptRef.current) {
            onTranscriptRef.current({
              type:      "transcript",
              text,
              isFinal:   result.isFinal,
              timestamp: Date.now(),
            });
          }
        }
      };

      recognition.onerror = (event) => {
        // "no-speech" and "aborted" are benign — don't surface as hard errors
        if (event.error === "no-speech" || event.error === "aborted") return;
        console.error("[Speech] Recognition error:", event.error);
        setError(`Microphone error: ${event.error}`);
        setStatus("error");
      };

      recognition.onend = () => {
        // Auto-restart while still in capturing state (browser stops after silence)
        if (recognitionRef.current) {
          try { recognitionRef.current.start(); } catch {}
        }
      };

      recognition.start();
    } catch (err) {
      console.error("[Speech] Failed to start:", err);
      setError(err.message || "Microphone access denied");
      setStatus("error");
    }
  }, []);

  const stopCapture = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.onend = null; // prevent auto-restart
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setStatus("idle");
  }, []);

  return { startCapture, stopCapture, status, error };
}
