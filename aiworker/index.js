import net from "net";
import axios from "axios";
import { execSync } from "child_process";
import FormData from "form-data";
// Env
const WHISPER = process.env.WHISPER_URL;
const OLLAMA = process.env.OLLAMA_URL;
const KOKORO = process.env.KOKORO_URL;
const AUDIO_SOCKET_PORT = 9092;

// Create AudioSocket server
const server = net.createServer((socket) => {
    console.log(
        `AudioSocket connection from ${socket.remoteAddress}:${socket.remotePort}`,
    );
    let buffer = Buffer.alloc(0);

    socket.on("data", async (data) => {
        buffer = Buffer.concat([buffer, data]);

        while (buffer.length >= 3) {
            const type = buffer.readUInt8(0);
            const length = buffer.readUInt16BE(1);
            if (buffer.length < 3 + length) break;
            const payload = buffer.slice(3, 3 + length);
            buffer = buffer.slice(3 + length);

            if (type === 0x01) {
                console.log("Received UUID handshake.");
            } else if (type === 0x10) {
                // Signed linear PCM 16-bit @ 8kHz
                const pcm16k = execSync(
                    "sox -t raw -r 8000 -e signed -b 16 -c 1 - -r 16000 -t raw -",
                    { input: payload },
                );

                // Transcribe
                const text = await transcribe(pcm16k);
                if (!text) continue;

                console.log(`Transcription: "${text}"`);

                // LLM
                const llmResp = await axios.post(OLLAMA, {
                    model: "llama3.2:3b",
                    messages: [{ role: "user", content: text }],
                });
                const reply = llmResp.data.choices[0].message.content;
                console.log(`LLM reply: "${reply}"`);

                // TTS
                const wav = await tts(reply);
                console.log(`TTS wav bytes: ${wav.length}`);

                // WAV -> SLIN 16-bit @ 8kHz
                const slin = execSync(
                    "sox -t wav - -r 8000 -e signed -b 16 -c 1 -t raw -",
                    { input: wav },
                );

                // Send back AudioSocket packet (type 0x10)
                const header = Buffer.alloc(3);
                header.writeUInt8(0x10, 0);
                header.writeUInt16BE(slin.length, 1);
                socket.write(header);
                socket.write(slin);
                console.log(`Sent audio packet of ${slin.length} bytes`);
            }
        }
    });

    socket.on("close", () => console.log("AudioSocket connection closed"));
    socket.on("error", (err) => console.error("AudioSocket error:", err));
});

server.listen(AUDIO_SOCKET_PORT, () =>
    console.log(`AudioSocket server listening on ${AUDIO_SOCKET_PORT}`),
);

// Transcribe PCM to text
async function transcribe(buf) {
    const form = new FormData();
    form.append("file", buf, {
        filename: "chunk.wav",
        contentType: "audio/wav",
    });

    const res = await axios.post(`${WHISPER}/inference`, form, {
        headers: form.getHeaders(),
        // keep or drop 'responseType: stream' depending on the option you chose
    });
    return res.data.text ?? "";
}

// Convert text to WAV
async function tts(text) {
    const response = await axios.post(
        KOKORO,
        { text },
        { responseType: "arraybuffer" },
    );
    return Buffer.from(response.data);
}
