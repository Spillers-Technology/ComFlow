// index.js
import AudioSocketServer from "./AudioSocketServer.js";
import AudioSocketSessionFactory from "./AudioSocketSessionFactory.js";
import { SoXConverter } from "./lib/SoXConverter.js";
import { FFMpegReverseConverter } from "./lib/FFMpegReverseConverter.js";
import { WhisperTranscriber } from "./lib/WhisperTranscriber.js";
import { OllamaLLM } from "./lib/OllamaLLM.js";
import { KokoroTTS } from "./lib/KokoroTTS.js";

// Instantiate the session factory with all required dependencies
const sessionFactory = new AudioSocketSessionFactory({
    converter: new SoXConverter(),
    reverseConverter: new FFMpegReverseConverter(),
    transcriber: new WhisperTranscriber({ url: process.env.WHISPER_URL }),
    llm: new OllamaLLM({ url: process.env.OLLAMA_URL }),
    tts: new KokoroTTS({ url: process.env.KOKORO_URL }),
});

// Create and start the AudioSocket server
const server = new AudioSocketServer({ port: 9092 }, sessionFactory);

// Handle incoming connections
server.on("connection", (socket) => {
    let session;
    try {
        // Factory will throw if sessionOptions are missing
        session = sessionFactory.create(socket);
    } catch (err) {
        console.error("Error creating AudioSocketSession:", err);
        socket.destroy();
        return;
    }
    // Start the session loop
    session.start();
});

// Begin listening
server
    .listen()
    .then(() => console.log("AudioSocket server listening on 0.0.0.0:9092"))
    .catch((err) => console.error("Server failed to start:", err));
