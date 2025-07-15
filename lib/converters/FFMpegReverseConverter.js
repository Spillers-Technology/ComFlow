// aiworker/lib/converters/FFMpegReverseConverter.js
import { spawn } from "child_process";

export class FFMpegReverseConverter {
    /**
     * @param {{ logger?: object }} options
     */
    constructor({ logger } = {}) {
        this.logger = logger;
    }

    /**
     * Stream a WAV buffer back to raw PCM for RTP streaming with live playback.
     * Emits fixed-size PCM chunks via the onChunk callback.
     * @param {{ wavBuffer: Buffer, onChunk: (chunk: Buffer) => void, chunkSize?: number }} params
     * @param {Buffer} params.wavBuffer - Input WAV audio buffer
     * @param {Function} params.onChunk - Callback invoked per PCM chunk
     * @param {number} [params.chunkSize=160] - Chunk size in bytes (defaults to 20ms of 8kHz mono audio)
     * @returns {Promise<void>} Resolves when streaming completes
     */
    stream({ wavBuffer, onChunk, chunkSize = 160 }) {
        return new Promise((resolve, reject) => {
            this.logger.visit(
                "FFMpegReverseConverter",
                "Starting ffmpeg for reverse streaming",
            );
            const ffmpeg = spawn("ffmpeg", [
                "-hide_banner",
                "-loglevel",
                "warning",
                "-i",
                "pipe:0",
                "-f",
                "s16le",
                "-ar",
                "8000",
                "-ac",
                "1",
                "pipe:1",
            ]);

            ffmpeg.on("error", (err) => {
                this.logger.visit(
                    "FFMpegReverseConverter",
                    `FFmpeg process error: ${err.message}`,
                    "ERROR",
                );
                reject(err);
            });

            ffmpeg.stdin.on("error", (err) => {
                // Happens if ffmpeg closes before we finish writing
                this.logger.visit(
                    "FFMpegReverseConverter",
                    `FFmpeg stdin error: ${err.message}`,
                    "ERROR",
                );
            });

            ffmpeg.stdout.on("error", (err) => {
                this.logger.visit(
                    "FFMpegReverseConverter",
                    `FFmpeg stdout error: ${err.message}`,
                    "ERROR",
                );
            });

            ffmpeg.on("close", (code) => {
                this.logger.visit(
                    "FFMpegReverseConverter",
                    `FFmpeg exited with code ${code}`,
                );
                code === 0
                    ? resolve()
                    : reject(new Error(`FFmpeg exited with code ${code}`));
            });

            // Feed WAV data into ffmpeg
            ffmpeg.stdin.write(wavBuffer);
            ffmpeg.stdin.end();

            // Accumulate and emit PCM chunks
            let buffer = Buffer.alloc(0);
            ffmpeg.stdout.on("data", (data) => {
                buffer = Buffer.concat([buffer, data]);
                while (buffer.length >= chunkSize) {
                    const chunk = buffer.slice(0, chunkSize);
                    buffer = buffer.slice(chunkSize);
                    try {
                        onChunk(chunk);
                    } catch (err) {
                        this.logger.visit(
                            "FFMpegReverseConverter",
                            `onChunk callback error: ${err.message}`,
                            "ERROR",
                        );
                    }
                }
            });
        });
    }

    /**
     * Fallback: Convert a WAV buffer fully into raw PCM Buffer.
     * @param {{ wavBuffer: Buffer }} params
     * @returns {Promise<Buffer>} Raw PCM buffer
     */
    async convert({ wavBuffer }) {
        this.logger.visit(
            "FFMpegReverseConverter",
            "Starting full-buffer conversion (fallback)",
        );
        return new Promise((resolve, reject) => {
            const ffmpeg = spawn("ffmpeg", [
                "-hide_banner",
                "-loglevel",
                "warning",
                "-i",
                "pipe:0",
                "-f",
                "s16le",
                "-ar",
                "8000",
                "-ac",
                "1",
                "pipe:1",
            ]);

            const chunks = [];
            ffmpeg.stdin.write(wavBuffer);
            ffmpeg.stdin.end();

            ffmpeg.stdout.on("data", (data) => chunks.push(data));
            ffmpeg.on("error", (err) => reject(err));
            ffmpeg.on("close", (code) => {
                code === 0
                    ? resolve(Buffer.concat(chunks))
                    : reject(new Error(`FFmpeg exited with code ${code}`));
            });
        });
    }
}
