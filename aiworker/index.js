import dgram from "dgram";
import axios from "axios";
import { Readable } from "stream";
import { execSync } from "child_process";

// Env
const WHISPER = process.env.WHISPER_URL;
const OLLAMA = process.env.OLLAMA_URL;
const KOKORO = process.env.KOKORO_URL;
const RECEIVE_PORT = 4000; // from extensions.conf
const SEND_PORT = 4001; // back to Asterisk (auto)
const ASTERISK_IP = "192.168.68.124";

// 1. RTP socket in (from caller)
const inSock = dgram.createSocket("udp4");
// 2. RTP socket out (to caller)
const outSock = dgram.createSocket("udp4");

let seq = 0;

inSock.on("message", async (msg) => {
  // strip RTP header (first 12 bytes) – assume 16‑bit PCM
  const pcm = msg.subarray(12);

  // Stream to Whisper‑stream endpoint (assumes it supports WebSocket/HTTP chunk)
  const text = await transcribe(pcm);
  if (!text) return;

  const llmResp = await axios.post(OLLAMA, {
    model: "llama3:instruct",
    messages: [{ role: "user", content: text }],
  });
  const reply = llmResp.data.choices[0].message.content;

  const wav = await tts(reply);
  const ulaw = pcmuFromWav(wav);

  // Build RTP packet
  const rtpHeader = Buffer.alloc(12);
  rtpHeader[0] = 0x80; // V2
  rtpHeader[1] = 0x11; // payload type 17 (dynamic) slin16 if we stay same fmt
  rtpHeader.writeUInt16BE(seq++ % 65536, 2);
  // TS & SSRC left zero – Asterisk doesn’t care in this loop

  const packet = Buffer.concat([rtpHeader, ulaw]);
  outSock.send(packet, SEND_PORT, ASTERISK_IP);
});

inSock.bind(RECEIVE_PORT, () => console.log("AI RTP listener up"));

async function transcribe(buf) {
  try {
    const { data } = await axios.post(WHISPER, buf, {
      headers: { "Content-Type": "application/octet-stream" },
    });
    return data.text.trim();
  } catch {
    return "";
  }
}

async function tts(text) {
  const { data } = await axios.post(
    KOKORO,
    { text },
    { responseType: "arraybuffer" },
  );
  return Buffer.from(data);
}

function pcmuFromWav(wavBuf) {
  //    sox conversion (simplest, could be native pcm‑u conversion)
  return execSync(
    "sox -t wav - -r 16000 -t raw - | sox - -r 16000 -c 1 -t ul -",
    { input: wavBuf },
  );
}
