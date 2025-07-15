// aiworker/lib/converters/SoXConverter.js
import { spawn } from "child_process";

export class SoXConverter {
    /**
     * @param {{ logger?: object }} options
     */
    constructor({ logger } = {}) {
        this.logger = logger;
    }

    /**
     * Convert raw PCM buffer to WAV format using SoX CLI.
     * @param {{ pcmBuffer: Buffer, rate?: number, channels?: number, bitdepth?: number }} params
     * @returns {Promise<Buffer>} WAV buffer
     */
    async convert({ pcmBuffer, rate = 8000, channels = 1, bitdepth = 16 }) {
        this.logger?.visit(
            "SoXConverter",
            `Starting PCM → WAV conversion (rate=${rate}, channels=${channels}, bitdepth=${bitdepth})`,
        );

        return new Promise((resolve, reject) => {
            const args = [
                "-t",
                "raw",
                "-r",
                String(rate),
                "-e",
                "signed",
                "-b",
                String(bitdepth),
                "-c",
                String(channels),
                "-", // input from stdin
                "-t",
                "wav",
                "-", // output to stdout
            ];

            const sox = spawn("sox", args);
            const chunks = [];

            sox.stdin.write(pcmBuffer);
            sox.stdin.end();

            sox.stdout.on("data", (data) => chunks.push(data));
            sox.stderr.on("data", (data) => {
                const msg = data.toString().trim();
                this.logger?.visit(
                    "SoXConverter",
                    `sox stderr: ${msg}`,
                    "WARN",
                );
            });

            sox.on("close", (code) => {
                if (code === 0) {
                    const wavBuffer = Buffer.concat(chunks);
                    this.logger?.visit("SoXConverter", "Conversion complete");
                    resolve(wavBuffer);
                } else {
                    const err = new Error(`SoX exited with code ${code}`);
                    this.logger?.visit("SoXConverter", err.message, "ERROR");
                    reject(err);
                }
            });
        });
    }
}
