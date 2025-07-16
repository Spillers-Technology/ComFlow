import { spawn } from "child_process";

/**
 * SoXConverter decodes raw μ-law (or other raw formats) into signed 16-bit LE PCM
 * using the SoX CLI.
 */
export class SoXConverter {
    /**
     * @param {{ logger?: object, sampleRate?: number, channels?: number }} options
     */
    constructor({ logger, sampleRate = 8000, channels = 1 } = {}) {
        this.logger = logger;
        this.sampleRate = sampleRate;
        this.channels = channels;
    }

    /**
     * Convert a raw μ-law buffer into PCM (s16le) Buffer.
     * @param {{ inputBuffer: Buffer }} params
     * @returns {Promise<Buffer>}
     */
    async convert({ inputBuffer }) {
        this.logger?.visit(
            "SoXConverter",
            `Decoding ${inputBuffer.length} bytes of μ-law to s16le @ ${this.sampleRate}Hz, ${this.channels}ch`,
        );

        return new Promise((resolve, reject) => {
            const args = [
                // Input: raw μ-law
                "-t",
                "raw",
                "-e",
                "mu-law",
                "-b",
                "8",
                "-r",
                String(this.sampleRate),
                "-c",
                String(this.channels),
                "-", // stdin
                // Output: raw signed 16-bit little-endian PCM
                "-t",
                "raw",
                "-e",
                "signed-integer",
                "-b",
                "16",
                "-L", // little-endian
                "-", // stdout
            ];

            const sox = spawn("sox", args);
            const chunks = [];

            sox.stdin.write(inputBuffer);
            sox.stdin.end();

            sox.stdout.on("data", (data) => chunks.push(data));
            sox.stderr.on("data", (data) => {
                const msg = data.toString().trim();
                this.logger?.visit("SoXConverter", `stderr: ${msg}`, "WARN");
            });

            sox.on("close", (code) => {
                if (code !== 0) {
                    const err = new Error(`SoX exited with code ${code}`);
                    this.logger?.visit("SoXConverter", err.message, "ERROR");
                    reject(err);
                } else {
                    const pcmBuffer = Buffer.concat(chunks);
                    this.logger?.visit("SoXConverter", "Decoding complete");
                    resolve(pcmBuffer);
                }
            });
        });
    }
}
