import express from "express";
import { AudioSocket } from "@fonoster/streams";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { spawn } from "child_process";

import { EventBus } from "./observer/EventBus.js";
import { AudioHandler } from "./chain/AudioHandler.js";
import { TranscribeHandler } from "./chain/TranscribeHandler.js";
import { LlMHandler } from "./chain/LlMHandler.js";
import { TTSHandler } from "./chain/TTSHandler.js";
// Note: we still import GreetingHandler for any internal logic, but greetings are generated here
import { GreetingHandler } from "./chain/GreetingHandler.js";

import { WavConverter } from "./lib/converters/WavConverter.js";
import { WhisperTranscriber } from "./lib/transcribers/WhisperTranscriber.js";
import { SoXConverter } from "./lib/converters/SoXConverter.js";
import { OllamaLLM } from "./lib/llm/OllamaLLM.js";
import { KokoroTTS } from "./lib/tts/KokoroTTS.js";

// Validate environment
const { WHISPER_URL, OLLAMA_URL, KOKORO_URL } = process.env;
if (!WHISPER_URL || !OLLAMA_URL || !KOKORO_URL) {
    console.error("[Fatal] Missing WHISPER_URL, OLLAMA_URL, or KOKORO_URL");
    process.exit(1);
}

const RTP_HOST = process.env.RTP_HOST || "0.0.0.0";
const RTP_PORT = Number(process.env.RTP_PORT_IN) || 9092;
const HTTP_PORT = Number(process.env.HTTP_PORT) || 3000;

/**
 * Returns a short, bubbly greeting that mentions Joseph Spillers.
 */
function generateGreeting() {
    const templates = [
        `Hey there! Joseph Spillers here—what can I do for you today?`,
        `Hiya! You’ve reached Joseph Spillers’ desk—how can I help?`,
        `Hello! It’s Joseph Spillers—ready to make your day smoother.`,
        `What’s up? Joseph Spillers on the line—how may I assist?`,
    ];
    return templates[Math.floor(Math.random() * templates.length)];
}

// Simple logger
class LoggingVisitor {
    constructor() {
        this.logs = [];
    }
    visit(component, msg, level = "INFO") {
        const entry = `[${new Date().toISOString()}] [${component}] [${level}] ${msg}`;
        this.logs.push(entry);
        if (this.logs.length > 1000) this.logs.shift();
        console.log(entry);
    }
    getLogs() {
        return this.logs.slice().reverse();
    }
}
const logger = new LoggingVisitor();

// Core pipeline
const bus = new EventBus();
const wavConverter = new WavConverter();
const transcriber = new WhisperTranscriber({
    url: WHISPER_URL,
    wavConverter,
    logger,
    maxConcurrency: 1,
    eventBus: bus,
    minIntervalMs: 1000,
});
const llm = new OllamaLLM({ url: OLLAMA_URL, logger });
const tts = new KokoroTTS({
    url: KOKORO_URL,
    voice: "af_bella",
    responseFormat: "wav",
    logger,
});
const sox = new SoXConverter({
    inputFormat: "mulaw",
    outputFormat: "s16le",
    sampleRate: 8000,
    channels: 1,
});

// Register handlers
new GreetingHandler({ eventBus: bus, tts, logger });
const audioHandler = new AudioHandler({ eventBus: bus, converter: sox });
new TranscribeHandler({ eventBus: bus, transcriber });
new LlMHandler({ eventBus: bus, llm });
new TTSHandler({ eventBus: bus, tts, logger });

// Downsample WAV to 8kHz mono for Asterisk
async function downsample(input, output) {
    return new Promise((resolve, reject) => {
        const ff = spawn("ffmpeg", [
            "-y",
            "-i",
            input,
            "-ar",
            "8000",
            "-ac",
            "1",
            output,
        ]);
        ff.on("exit", (code) =>
            code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`)),
        );
    });
}

// AudioSocket server
const audioSocket = new AudioSocket();

audioSocket.onConnection(async (req, res) => {
    const callRef = req.ref;
    logger.visit("AudioSocket", `Call connected: ${callRef}`);

    // Generate and play a dynamic greeting
    const greeting = generateGreeting();
    try {
        const wav16 = await tts.synthesize(greeting);
        const tmp16 = path.join(os.tmpdir(), `${callRef}-greet-16k.wav`);
        const tmp8 = path.join(os.tmpdir(), `${callRef}-greet-8k.wav`);
        await fs.writeFile(tmp16, wav16);
        await downsample(tmp16, tmp8);
        await res.play(tmp8);
        await fs.unlink(tmp16);
        await fs.unlink(tmp8);
        logger.visit("GreetingHandler", "Greeting played successfully");
    } catch (err) {
        logger.visit("GreetingHandler", `Error: ${err.message}`, "ERROR");
    }

    // Handle incoming audio
    res.onData((data) => audioHandler.handle({ chunk: data }));
    res.onError((err) => logger.visit("AudioSocket", err.message, "ERROR"));
    res.onClose(() => {
        logger.visit("AudioSocket", `Call ended: ${callRef}`);
        bus.off("audioOut", outListener);
    });

    // Dynamic TTS playback on audioOut
    const outListener = async (pcmBuf) => {
        try {
            const wav16 = await tts.synthesize(pcmBuf.toString());
            const tmp16 = path.join(
                os.tmpdir(),
                `${callRef}-${Date.now()}-16k.wav`,
            );
            const tmp8 = tmp16.replace("-16k.wav", "-8k.wav");
            await fs.writeFile(tmp16, wav16);
            await downsample(tmp16, tmp8);
            await res.play(tmp8);
            await fs.unlink(tmp16);
            await fs.unlink(tmp8);
        } catch (err) {
            logger.visit(
                "TTSHandler",
                `Playback error: ${err.message}`,
                "ERROR",
            );
        }
    };
    bus.on("audioOut", outListener);
});

audioSocket.listen(RTP_PORT, RTP_HOST, () => {
    logger.visit("AudioSocket", `Listening on ${RTP_HOST}:${RTP_PORT}`);
});

// HTTP Admin Console
const app = express();
app.get("/", (req, res) => {
    const html = logger
        .getLogs()
        .map((l) => `<li>${l}</li>`)
        .join("\n");
    res.send(
        `<html><body><h1>Admin Console</h1><ul>${html}</ul></body></html>`,
    );
});
app.listen(HTTP_PORT, () =>
    logger.visit("HTTP", `Console at http://0.0.0.0:${HTTP_PORT}`),
);
