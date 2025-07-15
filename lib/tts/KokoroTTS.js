// aiworker/lib/tts/KokoroTTS.js
import fetch from "node-fetch";

/**
 * KokoroTTS handles sending text to a Kokoro Text-to-Speech API and returning audio as a WAV buffer.
 */
export class KokoroTTS {
    /**
     * @param {{ url: string, voice?: string, logger?: object }} options
     */
    constructor({ url, voice = "default", logger } = {}) {
        this.url = url;
        this.voice = voice;
        this.logger = logger;
    }

    /**
     * Synthesizes speech audio for the given text.
     * @param {string} text - The text to synthesize.
     * @returns {Promise<Buffer>} - A Promise that resolves with a WAV audio buffer.
     */
    async synthesize(text) {
        this.logger.visit("KokoroTTS", "Sending text for synthesis");

        const payload = { text, voice: this.voice };

        const response = await fetch(`${this.url}/synthesize`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errText = await response.text();
            this.logger.visit(
                "KokoroTTS",
                `TTS synthesis failed: ${errText}`,
                "ERROR",
            );
            throw new Error(`KokoroTTS API error: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const wavBuffer = Buffer.from(arrayBuffer);
        this.logger.visit("KokoroTTS", "Received synthesized WAV buffer");
        return wavBuffer;
    }
}
