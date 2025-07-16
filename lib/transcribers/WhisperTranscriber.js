import fetch from "node-fetch";
import FormData from "form-data";

/**
 * WhisperTranscriber buffers incoming PCM, chunks into fixed-duration windows,
 * converts to WAV, and sends to a Whisper inference endpoint.
 * Emits "transcript" on the provided EventBus for downstream handlers.
 */
export class WhisperTranscriber {
    /**
     * @param {{ url: string, wavConverter: object, logger?: object, eventBus: object, chunkDurationMs?: number }} options
     */
    constructor({
        url,
        wavConverter,
        logger,
        eventBus,
        chunkDurationMs = 1000,
    } = {}) {
        this.url = url;
        this.wavConverter = wavConverter;
        this.logger = logger;
        this.eventBus = eventBus;

        // Buffer for raw PCM data
        this.buffer = Buffer.alloc(0);
        // Number of bytes per chunk: sampleRate(8000) * bytesPerSample(2) * seconds
        this.CHUNK_BYTES = 8000 * 2 * (chunkDurationMs / 1000);
        this.isProcessing = false;

        // Periodically flush every chunkDurationMs
        this._timer = setInterval(() => this._periodicFlush(), chunkDurationMs);
    }

    /**
     * Feed raw PCM 16-bit LE, 8kHz mono
     * @param {Buffer} pcmChunk
     */
    feed(pcmChunk) {
        this.buffer = Buffer.concat([this.buffer, pcmChunk]);
    }

    /**
     * Periodically flushes whatever is in the buffer up to CHUNK_BYTES
     */
    async _periodicFlush() {
        if (this.isProcessing || this.buffer.length === 0) return;

        // Take up to CHUNK_BYTES
        const length = Math.min(this.buffer.length, this.CHUNK_BYTES);
        let chunk = this.buffer.slice(0, length);
        this.buffer = this.buffer.slice(length);

        // Pad if shorter than a full chunk
        if (chunk.length < this.CHUNK_BYTES) {
            chunk = Buffer.concat([
                chunk,
                Buffer.alloc(this.CHUNK_BYTES - chunk.length),
            ]);
        }

        await this._dispatch(chunk);
    }

    /**
     * Convert PCM to WAV, send to Whisper API, emit transcript on the bus
     * @private
     */
    async _dispatch(pcm) {
        this.isProcessing = true;
        try {
            this.logger?.visit(
                "WhisperTranscriber",
                `Dispatching ${pcm.length} bytes`,
            );
            const wavBuf = await this.wavConverter.convert({ pcmBuffer: pcm });

            const form = new FormData();
            form.append("file", wavBuf, {
                filename: "chunk.wav",
                contentType: "audio/wav",
            });
            form.append("response_format", "json");

            const resp = await fetch(`${this.url}/inference`, {
                method: "POST",
                body: form,
                headers: form.getHeaders(),
            });

            if (!resp.ok) throw new Error(`API ${resp.status}`);
            const { text } = await resp.json();

            this.logger?.visit(
                "WhisperTranscriber",
                `Received transcript: ${text}`,
            );
            this.eventBus.emit("transcript", text);
        } catch (err) {
            this.logger?.visit("WhisperTranscriber", err.message, "ERROR");
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Clean up resources (e.g. when call ends)
     */
    shutdown() {
        clearInterval(this._timer);
    }
}
