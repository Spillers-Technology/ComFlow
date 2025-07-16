import { EventBus } from "../observer/EventBus.js";

/**
 * TranscribeHandler wires raw PCM chunks into the WhisperTranscriber
 * and ensures transcription events flow over the EventBus.
 */
export class TranscribeHandler {
    /**
     * @param {{ eventBus: EventBus, transcriber: import("./WhisperTranscriber.js").WhisperTranscriber }} deps
     */
    constructor({ eventBus, transcriber }) {
        this.eventBus = eventBus;
        this.transcriber = transcriber;

        // Ensure the transcriber has the bus for direct emits
        this.transcriber.eventBus = this.eventBus;

        // Feed every PCM chunk into the transcriber
        this.eventBus.on("audioChunk", (pcmBuf) => {
            this.transcriber.feed(pcmBuf);
        });

        // Re-emit transcripts from the transcriber on the EventBus
        if (typeof this.transcriber.on === "function") {
            this.transcriber.on("transcript", (text) => {
                this.eventBus.emit("transcript", text);
            });
        }
    }
}
