// aiworker/facade/ServiceFacade.js
import { spawn } from "child_process";
import { once } from "events";

export class ServiceFacade {
    constructor({ transcriber, llm, tts, converter, reverse, socket, logger }) {
        this.transcriber = transcriber;
        this.llm = llm;
        this.tts = tts;
        this.converter = converter;
        this.reverse = reverse;
        this.socket = socket;
        this.logger = logger;
    }

    /**
     * Full call flow with streaming and metrics:
     * PCM → WAV → Whisper (stream/batch) → LLM (stream/batch) → TTS (stream/batch) → PCM chunks → RTP
     * @param {{ pcm: Buffer, rinfo: object, sendPort: number, sendHost: string }} params
     */
    async processAudio({ pcm, rinfo, sendPort, sendHost }) {
        const metrics = {};
        metrics.start = Date.now();
        try {
            this.logger.visit(
                "ServiceFacade",
                `Received ${pcm.length} bytes of PCM from ${rinfo.address}:${rinfo.port}`,
            );

            // 1. Convert raw PCM → WAV
            metrics.convertStart = Date.now();
            const wavBuffer = await this.converter.convert({ pcmBuffer: pcm });
            metrics.convertEnd = Date.now();
            this.logger.visit(
                "ServiceFacade",
                "Converted PCM to WAV for transcription",
            );

            // 2. Transcription (stream/batch)
            metrics.transcribeStart = Date.now();
            let transcript = "";
            // onPartial callback for streaming transcripts
            const onTranscribeChunk = (chunk) => {
                this.logger.visit(
                    "ServiceFacade",
                    `Partial transcript: "${chunk}"`,
                );
                transcript += chunk;
            };
            try {
                const result = await this.transcriber.transcribe(
                    wavBuffer,
                    onTranscribeChunk,
                );
                // If batch mode, result is full transcript
                if (result) transcript = result;
            } catch (e) {
                this.logger.visit(
                    "ServiceFacade",
                    `Streamed transcription failed, falling back: ${e.message}`,
                    "WARN",
                );
                transcript = await this.transcriber.transcribe(wavBuffer);
            }
            metrics.transcribeEnd = Date.now();
            this.logger.visit(
                "ServiceFacade",
                `Transcription result: "${transcript}"`,
            );

            // 3. LLM query (stream/batch)
            metrics.llmStart = Date.now();
            let llmOutput = "";
            const onLlmChunk = (chunk) => {
                this.logger.visit(
                    "ServiceFacade",
                    `Partial LLM output: "${chunk}"`,
                );
                llmOutput += chunk;
            };
            try {
                const result = await this.llm.query(transcript, onLlmChunk);
                if (result) llmOutput = result;
            } catch (e) {
                this.logger.visit(
                    "ServiceFacade",
                    `Streamed LLM failed, falling back: ${e.message}`,
                    "WARN",
                );
                llmOutput = await this.llm.query(transcript);
            }
            metrics.llmEnd = Date.now();
            this.logger.visit("ServiceFacade", `LLM response: "${llmOutput}"`);

            // 4. TTS synthesis and RTP streaming
            metrics.ttsStart = Date.now();
            // Spawn ffmpeg for WAV → raw PCM
            const ffmpegProc = spawn("ffmpeg", [
                "-hide_banner",
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
            // Handle PCM chunks from ffmpeg stdout
            let pcmBufferResidue = Buffer.alloc(0);
            ffmpegProc.stdout.on("data", (data) => {
                pcmBufferResidue = Buffer.concat([pcmBufferResidue, data]);
                // Send fixed-size chunks (20ms @8kHz = 160 bytes)
                while (pcmBufferResidue.length >= 160) {
                    const chunk = pcmBufferResidue.slice(0, 160);
                    pcmBufferResidue = pcmBufferResidue.slice(160);
                    this.socket.send(
                        chunk,
                        0,
                        chunk.length,
                        sendPort,
                        sendHost,
                    );
                }
            });
            ffmpegProc.on("error", (err) => {
                this.logger.visit(
                    "ServiceFacade",
                    `FFmpeg error: ${err.message}`,
                    "ERROR",
                );
            });

            // Attempt streaming TTS
            try {
                await this.tts.synthesize(llmOutput, (wavChunk) => {
                    ffmpegProc.stdin.write(wavChunk);
                });
                // Signal end of WAV input
                ffmpegProc.stdin.end();
                // Wait for ffmpeg to finish
                await once(ffmpegProc, "close");
            } catch (e) {
                this.logger.visit(
                    "ServiceFacade",
                    `Streaming TTS failed, falling back: ${e.message}`,
                    "WARN",
                );
                // Clean up ffmpeg
                try {
                    ffmpegProc.stdin.end();
                } catch {}
                ffmpegProc.kill();
                // Batch TTS → full WAV buffer
                const ttsWav = await this.tts.synthesize(llmOutput);
                // Convert full WAV → PCM chunks
                await this.reverse.stream({
                    wavBuffer: ttsWav,
                    onChunk: (chunk) => {
                        this.socket.send(
                            chunk,
                            0,
                            chunk.length,
                            sendPort,
                            sendHost,
                        );
                    },
                });
            }
            metrics.ttsEnd = Date.now();

            // 5. Log pipeline metrics
            metrics.end = Date.now();
            const total = metrics.end - metrics.start;
            const convertTime = metrics.convertEnd - metrics.convertStart;
            const transcribeTime =
                metrics.transcribeEnd - metrics.transcribeStart;
            const llmTime = metrics.llmEnd - metrics.llmStart;
            const ttsTime = metrics.ttsEnd - metrics.ttsStart;
            this.logger.visit(
                "ServiceFacade",
                `Metrics (ms): total=${total}, convert=${convertTime}, transcribe=${transcribeTime}, llm=${llmTime}, tts=${ttsTime}`,
            );
        } catch (err) {
            this.logger.visit(
                "ServiceFacade",
                `Processing error: ${err.message}`,
                "ERROR",
            );
            throw err;
        }
    }
}
