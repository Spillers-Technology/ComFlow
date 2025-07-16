import { ISilenceDetector } from "./ISilenceDetector.js";

export class RmsSilenceDetector extends ISilenceDetector {
    /**
     * @param {{ threshold?: number, minSilenceMs?: number }} options
     */
    constructor({ threshold = 0.02, minSilenceMs = 200 } = {}) {
        super();
        this.threshold = threshold;
        this.minSilenceSamples = minSilenceMs * 8; // @8 kHz
        this.buffer = Buffer.alloc(0);
        this.silenceRun = 0;
        this.inSpeech = false;
    }

    /**
     * Process raw PCM, detect utterances when silence exceeds minSilence,
     * and return complete utterance buffers.
     * @param {Buffer} pcmChunk
     * @returns {Buffer[]}
     */
    process(pcmChunk) {
        // Append incoming chunk
        this.buffer = Buffer.concat([this.buffer, pcmChunk]);

        const utterances = [];
        // Only iterate full samples (2 bytes each)
        const totalBytes = this.buffer.length - (this.buffer.length % 2);
        let lastUtteranceEnd = 0;

        for (let i = 0; i < totalBytes; i += 2) {
            const sample = this.buffer.readInt16LE(i) / 32768;
            const isQuiet = Math.abs(sample) < this.threshold;

            if (isQuiet) {
                this.silenceRun++;
            } else {
                this.silenceRun = 0;
            }

            // Start of speech
            if (!this.inSpeech && !isQuiet) {
                this.inSpeech = true;
            }

            // End of speech: silence too long
            if (this.inSpeech && this.silenceRun > this.minSilenceSamples) {
                // carve out utterance up to start of silence
                const utteranceEnd = i - this.silenceRun * 2 + 2;
                const utterance = this.buffer.slice(
                    lastUtteranceEnd,
                    utteranceEnd,
                );
                utterances.push(utterance);
                lastUtteranceEnd = utteranceEnd;
                // reset speech/silence tracking
                this.inSpeech = false;
                this.silenceRun = 0;
            }
        }

        // Keep leftover (partial utterance + trailing odd byte if any)
        this.buffer = this.buffer.slice(lastUtteranceEnd);

        return utterances;
    }
}
