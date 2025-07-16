import fetch from "node-fetch";

/**
 * KokoroTTS handles sending text to a Kokoro-FastAPI TTS endpoint and returning audio as a WAV buffer.
 */
export class KokoroTTS {
    /**
     * @param {{ url: string, voice?: string, logger?: object, modelName?: string, responseFormat?: string }} options
     */
    constructor({
        url,
        voice = "af_irulan",
        modelName = "kokoro",
        responseFormat = "wav",
        logger,
    } = {}) {
        // strip trailing slash
        this.url = url.replace(/\/+$/, "");
        this.voice = voice;
        this.modelName = modelName;
        this.responseFormat = responseFormat; // 'wav' to receive properly formatted WAV
        this.logger = logger;
    }

    /**
     * Synthesizes speech audio for the given text via Kokoro-FastAPI OpenAI-compatible endpoint
     * @param {string} text - The text to synthesize.
     * @returns {Promise<Buffer>} - A Promise that resolves with a WAV audio buffer (16-bit LE PCM, sample rate as configured).
     */
    async synthesize(text) {
        this.logger?.visit(
            "KokoroTTS",
            `Sending text for synthesis: "${text}"`,
        );

        const payload = {
            model: this.modelName,
            input: text,
            voice: this.voice,
            response_format: this.responseFormat,
        };
        const endpoint = `${this.url}/v1/audio/speech`;

        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "audio/wav",
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errText = await response.text();
            this.logger?.visit(
                "KokoroTTS",
                `TTS synthesis failed: ${errText}`,
                "ERROR",
            );
            throw new Error(`KokoroTTS API error: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const wavBuffer = Buffer.from(arrayBuffer);
        this.logger?.visit("KokoroTTS", "Received synthesized WAV buffer");
        return wavBuffer;
    }
}
