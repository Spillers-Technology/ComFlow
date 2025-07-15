import fetch from "node-fetch";
import FormData from "form-data";

/**
 * WhisperTranscriber handles sending WAV buffers to a Whisper.cpp HTTP server's /inference endpoint.
 */
export class WhisperTranscriber {
    /**
     * @param {{ url: string, logger?: object, temperature?: number, temperatureInc?: number, responseFormat?: string }} options
     */
    constructor({
        url,
        logger,
        temperature = 0.0,
        temperatureInc = 0.2,
        responseFormat = "json",
    } = {}) {
        this.url = url;
        this.logger = logger;
        this.temperature = temperature;
        this.temperatureInc = temperatureInc;
        this.responseFormat = responseFormat;
    }

    /**
     * Transcribe a WAV audio buffer via Whisper.cpp /inference.
     * @param {Buffer} wavBuffer - The WAV-formatted audio buffer
     * @returns {Promise<string>} - Transcribed text
     */
    async transcribe(wavBuffer) {
        this.logger?.visit(
            "WhisperTranscriber",
            "Starting transcription request",
        );
        try {
            const form = new FormData();
            form.append("file", wavBuffer, {
                filename: "audio.wav",
                contentType: "audio/wav",
            });
            form.append("temperature", String(this.temperature));
            form.append("temperature_inc", String(this.temperatureInc));
            form.append("response_format", this.responseFormat);

            const response = await fetch(`${this.url}/inference`, {
                method: "POST",
                body: form,
                headers: form.getHeaders(),
            });

            if (!response.ok) {
                const errorText = await response.text();
                this.logger?.visit(
                    "WhisperTranscriber",
                    `API error: ${errorText}`,
                    "ERROR",
                );
                throw new Error(
                    `Whisper API responded with ${response.status}`,
                );
            }

            const result = await response.json();
            // The server returns JSON with a "text" field
            const transcript = result.text;
            this.logger?.visit(
                "WhisperTranscriber",
                `Received transcription: "${transcript}"`,
            );

            return transcript;
        } catch (err) {
            this.logger?.visit(
                "WhisperTranscriber",
                `Transcription failed: ${err.message}`,
                "ERROR",
            );
            throw err;
        }
    }
}
