// chain/GreetingHandler.js

/**
 * GreetingHandler sends a TTS greeting immediately on new call connection.
 * Now handles raw PCM directly without additional conversion.
 */
export class GreetingHandler {
    /**
     * @param {{ eventBus: object, tts: object, logger?: object }} deps
     */
    constructor({ eventBus, tts, logger } = {}) {
        this.eventBus = eventBus;
        this.tts = tts;
        this.logger = logger;

        // listen for new connection events
        eventBus.on("connection", async ({ address, port }) => {
            const greeting = "Hi-ya! It's Val, How can I help?";
            this.logger?.visit(
                "GreetingHandler",
                `Synthesizing greeting: ${greeting}`,
            );
            try {
                // synthesize raw PCM (16-bit LE, 8kHz mono)
                const pcmBuffer = await this.tts.synthesize(greeting);
                // chunk into 160-byte frames for RTP (20ms @8kHz)
                for (let offset = 0; offset < pcmBuffer.length; offset += 160) {
                    const frame = pcmBuffer.slice(offset, offset + 160);
                    this.eventBus.emit("audioOut", frame);
                }
            } catch (err) {
                this.logger?.visit(
                    "GreetingHandler",
                    `Greeting synthesis failed: ${err.message}`,
                    "ERROR",
                );
            }
        });
    }
}
