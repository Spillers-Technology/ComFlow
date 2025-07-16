// chain/AudioHandler.js
import { SoXConverter } from "../lib/converters/SoXConverter.js";

export class AudioHandler {
    constructor({ eventBus, converter }) {
        this.eventBus = eventBus;
        this.converter = converter; // new SoXConverter({ from: "mulaw", to: "pcm_s16le", rate: 8000 })
    }

    async handle({ chunk }) {
        const pcm16 = await this.converter.convert({
            inputBuffer: chunk,
            inputFormat: "mulaw",
            outputFormat: "s16le",
            sampleRate: 8000,
            channels: 1,
        });
        this.eventBus.emit("audioChunk", pcm16);
    }
}
