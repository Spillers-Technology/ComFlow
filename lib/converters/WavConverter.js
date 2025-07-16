// lib/converters/WavConverter.js

export class WavConverter {
    /**
     * Wraps a raw PCM buffer (signed 16‑bit LE, mono, 8 kHz) in a RIFF/WAVE header.
     * @param {{ pcmBuffer: Buffer, rate?: number, channels?: number, bitdepth?: number }} params
     * @returns {Promise<Buffer>} WAV buffer
     */
    async convert({ pcmBuffer, rate = 8000, channels = 1, bitdepth = 16 }) {
        const byteRate = rate * channels * (bitdepth / 8);
        const blockAlign = channels * (bitdepth / 8);
        const dataSize = pcmBuffer.length;
        const riffChunkLen = 36 + dataSize;

        const header = Buffer.alloc(44);
        let offset = 0;

        header.write("RIFF", offset);
        offset += 4;
        header.writeUInt32LE(riffChunkLen, offset);
        offset += 4;
        header.write("WAVE", offset);
        offset += 4;

        header.write("fmt ", offset);
        offset += 4;
        header.writeUInt32LE(16, offset);
        offset += 4; // subchunk1 size
        header.writeUInt16LE(1, offset);
        offset += 2; // PCM format
        header.writeUInt16LE(channels, offset);
        offset += 2;
        header.writeUInt32LE(rate, offset);
        offset += 4;
        header.writeUInt32LE(byteRate, offset);
        offset += 4;
        header.writeUInt16LE(blockAlign, offset);
        offset += 2;
        header.writeUInt16LE(bitdepth, offset);
        offset += 2;

        header.write("data", offset);
        offset += 4;
        header.writeUInt32LE(dataSize, offset);
        offset += 4;

        // concat header + raw PCM
        return Buffer.concat([header, pcmBuffer]);
    }
}
