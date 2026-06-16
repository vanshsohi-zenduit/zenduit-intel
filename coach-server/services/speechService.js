import { DeepgramService } from "./deepgramService.js";

// SpeechService delegates to DeepgramService.
// Kept as a thin wrapper so the server doesn't need to change if we swap STT providers.
export class SpeechService extends DeepgramService {
  constructor() {
    super();
  }
}
