export class ServiceFacade {
    constructor(deps) {
        Object.assign(this, deps);
        this.pcmBuffer = Buffer.alloc(0);
        this.flushInterval = setInterval(() => this._flush(), 150); // every 150 ms
        this.queue = [];
        this.busy = false;
    }

    // called by your RTP socket on every packet
    enqueuePacket(pcm, rinfo, sendPort, sendHost) {
        this.pcmBuffer = Buffer.concat([this.pcmBuffer, pcm]);
        this.currentRinfo = { rinfo, sendPort, sendHost };
    }

    // flush out whatever PCM we have every interval
    async _flush() {
        if (this.pcmBuffer.length < 1600) return; // wait for at least ~100 ms @8 kHz
        const chunk = this.pcmBuffer;
        this.pcmBuffer = Buffer.alloc(0);
        this.queue.push({ chunk, ...this.currentRinfo });
        this._processQueue();
    }

    async _processQueue() {
        if (this.busy || !this.queue.length) return;
        this.busy = true;
        const { chunk, rinfo, sendPort, sendHost } = this.queue.shift();

        try {
            // 1) PCM→WAV
            const wav = await this.converter.convert({ pcmBuffer: chunk });

            // 2) Transcript chunk
            const partial = await this.transcriber.transcribe(wav);
            // you could buffer these or send immediately as interim to LLM:

            // 3) LLM query on this partial (treat as continuation context)
            const replyText = await this.llm.query(partial);

            // 4) TTS this replyText chunk
            // spawn ffmpeg only once per chunk
            const ffmpeg = spawn("ffmpeg", [
                /* as before */
            ]);
            ffmpeg.stdout.on("data", (data) =>
                this._sendPcmPackets(data, sendPort, sendHost),
            );
            ffmpeg.stdin.write(await this.tts.synthesize(replyText));
            ffmpeg.stdin.end();
            await once(ffmpeg, "close");
        } catch (err) {
            this.logger.visit(
                "ServiceFacade",
                `Chunk processing error: ${err.message}`,
                "ERROR",
            );
        } finally {
            this.busy = false;
            // trigger next chunk
            this._processQueue();
        }
    }

    _sendPcmPackets(data, port, host) {
        let buf = Buffer.concat([this._residue || Buffer.alloc(0), data]);
        while (buf.length >= 160) {
            const packet = buf.slice(0, 160);
            buf = buf.slice(160);
            this.socket.send(packet, 0, 160, port, host);
        }
        this._residue = buf;
    }
}
