import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
// Load .env from project root (one level up from coach-server/)
loadEnv({ path: resolve(__dirname, "../.env") });

import express from "express";
import cors from "cors";
import http from "http";
import { WebSocketServer } from "ws";
import { SpeechService } from "./services/speechService.js";
import { fetchPlaybookContext } from "./services/mcpService.js";
import { streamCoachingSuggestions, streamChatAnswer } from "./services/coachingService.js";

const app = express();
const PORT = process.env.COACH_PORT || 3002;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:8080";

app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "zenduit-coach" });
});

app.post("/v1/coach/suggest", async (req, res) => {
  const { query, agentId, company = "Zenduit", prospectContext = "" } = req.body;

  if (!query || !agentId) {
    return res.status(400).json({ error: "Missing 'query' or 'agentId'" });
  }

  console.log(`[Coach] Agent ${agentId} (${company}): "${query.substring(0, 80)}..."`);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  try {
    const mcpContext = await fetchPlaybookContext(query, agentId);
    for await (const token of streamCoachingSuggestions(query, mcpContext, company, prospectContext)) {
      res.write(token);
    }
  } catch (err) {
    console.error("[Coach] Unhandled error:", err);
    res.write("⚠ An error occurred. Please rely on your training.");
  }

  res.end();
});

app.post("/v1/coach/chat", async (req, res) => {
  const { question, prospectContext = "" } = req.body;
  if (!question) return res.status(400).json({ error: "Missing 'question'" });

  console.log(`[Coach] Chat: "${question.substring(0, 80)}"`);

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  try {
    for await (const token of streamChatAnswer(question, prospectContext)) {
      res.write(token);
    }
  } catch (err) {
    console.error("[Coach] Chat error:", err);
    res.write("⚠ Could not process your question. Please try again.");
  }
  res.end();
});

// ─── WebSocket (audio → Deepgram) ──────────────────────────────────────────
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/audio" });
const activeSessions = new Map();

wss.on("connection", (ws) => {
  console.log("[WS] Audio client connected");
  const speechService = new SpeechService();
  activeSessions.set(ws, speechService);

  speechService.connect().catch((err) => {
    console.error("[WS] Deepgram init failed:", err);
    ws.close(1011, "Deepgram connection failed");
  });

  speechService.on("transcript", (data) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: "transcript", text: data.text, isFinal: data.isFinal, timestamp: Date.now() }));
    }
  });

  speechService.on("error", (err) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: "error", message: err.message || "Deepgram error" }));
    }
  });

  ws.on("message", (data, isBinary) => {
    if (isBinary) {
      speechService.sendAudio(data);
    } else {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "ping") ws.send(JSON.stringify({ type: "pong" }));
      } catch {}
    }
  });

  ws.on("close", () => {
    console.log("[WS] Audio client disconnected");
    speechService.close();
    activeSessions.delete(ws);
  });

  ws.on("error", (err) => {
    console.error("[WS] Error:", err);
    speechService.close();
    activeSessions.delete(ws);
  });
});

server.listen(PORT, () => {
  console.log(`[Coach] Server running on http://localhost:${PORT}`);
  console.log(`[Coach] WebSocket on ws://localhost:${PORT}/audio`);
  console.log(`[Coach] CORS origin: ${CORS_ORIGIN}`);
});

process.on("SIGTERM", () => {
  for (const [ws, svc] of activeSessions) { svc.close(); ws.close(1001, "Shutdown"); }
  activeSessions.clear();
  server.close(() => process.exit(0));
});
