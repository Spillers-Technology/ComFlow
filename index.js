// aiworker/index.js

import express from "express";
import net from "net";
import { ServiceFacade } from "./facade/ServiceFacade.js";

// Strategy implementations
import { SoXConverter } from "./lib/converters/SoXConverter.js";
import { FFMpegReverseConverter } from "./lib/converters/FFMpegReverseConverter.js";
import { WhisperTranscriber } from "./lib/transcribers/WhisperTranscriber.js";
import { OllamaLLM } from "./lib/llm/OllamaLLM.js";
import { KokoroTTS } from "./lib/tts/KokoroTTS.js";

// Ensure environment variables for service URLs are set
const { WHISPER_URL, OLLAMA_URL, KOKORO_URL } = process.env;
if (!WHISPER_URL || !OLLAMA_URL || !KOKORO_URL) {
    console.error(
        "[Fatal] One or more service URLs (WHISPER_URL, OLLAMA_URL, KOKORO_URL) are not defined or invalid.",
    );
    process.exit(1);
}

// Configuration matching FreePBX AudioSocket settings
const RECEIVE_HOST = process.env.RTP_HOST || "0.0.0.0";
const RECEIVE_PORT = +process.env.RTP_PORT_IN || 9092;
const HTTP_PORT = +process.env.HTTP_PORT || 3000;

// Visitor Pattern for Logging
class LoggingVisitor {
    constructor() {
        this.logs = [];
    }
    visit(component, message, level = "INFO") {
        const entry = `[${new Date().toISOString()}] [${component}] [${level}] ${message}`;
        this.logs.push(entry);
        if (this.logs.length > 1000) this.logs.shift();
        console.log(entry);
    }
    getLogs() {
        return this.logs.slice().reverse();
    }
}
const logger = new LoggingVisitor();

// Instantiate common ServiceFacade dependencies
const facadeDependencies = {
    transcriber: new WhisperTranscriber({ url: WHISPER_URL, logger }),
    llm: new OllamaLLM({ url: OLLAMA_URL, logger }),
    tts: new KokoroTTS({ url: KOKORO_URL, logger }),
    converter: new SoXConverter({ logger }),
    reverse: new FFMpegReverseConverter({ logger }),
    logger,
};

// Create TCP server for FreePBX AudioSocket
const audioServer = net.createServer((client) => {
    logger.visit(
        "AudioSocket",
        `Client connected from ${client.remoteAddress}:${client.remotePort}`,
    );

    // Wrap TCP client in a send-compatible API
    const audioSocketWrapper = {
        send: (buffer) => client.write(buffer),
    };

    const facade = new ServiceFacade({
        ...facadeDependencies,
        socket: audioSocketWrapper,
    });

    client.on("data", async (data) => {
        logger.visit(
            "AudioSocket",
            `Received ${data.length} bytes of PCM from ${client.remoteAddress}:${client.remotePort}`,
        );
        try {
            await facade.processAudio({
                pcm: data,
                rinfo: {
                    address: client.remoteAddress,
                    port: client.remotePort,
                },
            });
        } catch (err) {
            logger.visit(
                "ServiceFacade",
                `Error in call flow: ${err.message}`,
                "ERROR",
            );
        }
    });

    client.on("close", () => {
        logger.visit("AudioSocket", "Client disconnected");
    });

    client.on("error", (err) => {
        logger.visit(
            "AudioSocket",
            `Client socket error: ${err.message}`,
            "ERROR",
        );
    });
});

audioServer.on("error", (err) => {
    logger.visit("AudioSocket", `Server error: ${err.message}`, "ERROR");
});

audioServer.listen(RECEIVE_PORT, RECEIVE_HOST, () => {
    logger.visit(
        "AudioSocket",
        `TCP AudioSocket server listening on ${RECEIVE_HOST}:${RECEIVE_PORT}`,
    );
});

// HTTP Admin Console
const app = express();

app.get("/", (req, res) => {
    const logsHtml = logger
        .getLogs()
        .map((log) => `<li>${log}</li>`)
        .join("");
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>AIWorker Admin Console</title>
      <meta http-equiv="refresh" content="5">
      <style>
        body { font-family: monospace; background: #222; color: #eee; padding: 20px; }
        ul { list-style: none; padding: 0; }
        li { padding: 2px 0; }
      </style>
    </head>
    <body>
      <h1>🔧 AIWorker Admin Console</h1>
      <ul>${logsHtml}</ul>
    </body>
    </html>
  `);
});

app.listen(HTTP_PORT, () => {
    logger.visit(
        "HTTP Server",
        `🚀 Admin console running at http://0.0.0.0:${HTTP_PORT}`,
    );
});
