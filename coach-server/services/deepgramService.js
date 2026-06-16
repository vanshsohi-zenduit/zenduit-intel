import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import EventEmitter from "events";

export class DeepgramService extends EventEmitter {
  constructor() {
    super();
    this.client = createClient(process.env.DEEPGRAM_API_KEY);
    this.connection = null;
    this.keepAliveInterval = null;
  }

  async connect() {
    this.connection = this.client.listen.live({
      model: "nova-2",
      language: "en-US",
      smart_format: true,
      interim_results: false,
      endpointing: 300,
      encoding: "linear16",
      sample_rate: 16000,
    });

    this.connection.on(LiveTranscriptionEvents.Open, () => {
      console.log("[Deepgram] Connection opened");
      this.keepAliveInterval = setInterval(() => {
        if (this.connection) this.connection.keepAlive();
      }, 10000);
    });

    this.connection.on(LiveTranscriptionEvents.Transcript, (data) => {
      const transcript = data.channel?.alternatives?.[0]?.transcript;
      if (transcript && data.is_final) {
        console.log("[Deepgram] Final transcript:", transcript);
        this.emit("transcript", { text: transcript, isFinal: true });
      }
    });

    this.connection.on(LiveTranscriptionEvents.Error, (err) => {
      console.error("[Deepgram] Error:", err);
      this.emit("error", err);
    });

    this.connection.on(LiveTranscriptionEvents.Close, () => {
      console.log("[Deepgram] Connection closed");
      this.cleanup();
      this.emit("close");
    });
  }

  sendAudio(audioBuffer) {
    if (this.connection) this.connection.send(audioBuffer);
  }

  close() {
    if (this.connection) this.connection.requestClose();
    this.cleanup();
  }

  cleanup() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
    this.connection = null;
  }
}
