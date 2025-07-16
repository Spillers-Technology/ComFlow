// lib/detectors/ISilenceDetector.js
export class ISilenceDetector {
    /**
     * process raw PCM, return array of complete utterance‐buffers (if any)
     * @param {Buffer} pcmChunk
     * @returns {Buffer[]}
     */
    process(pcmChunk) {
        throw new Error("Not implemented");
    }
}
