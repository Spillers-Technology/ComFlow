// AudioSocketSessionFactory.js
class AudioSocketSessionFactory {
    constructor(sessionOptions) {
        this.options = sessionOptions;
    }

    create(socket) {
        const opts = this.options;
        if (!opts) {
            throw new Error("Session options not provided");
        }
        const { converter, reverseConverter, transcriber, llm, tts } = opts;
        return new AudioSocketSession(opts, socket);
    }
}

class AudioSocketSession {
    constructor(
        { converter, reverseConverter, transcriber, llm, tts },
        socket,
    ) {
        this.converter = converter;
        this.reverseConverter = reverseConverter;
        this.transcriber = transcriber;
        this.llm = llm;
        this.tts = tts;
        this.socket = socket;
    }

    start() {
        // TODO: wire up your audio processing loop here
        this.socket.on("data", (data) => {
            // process incoming audio…
        });
        this.socket.on("end", () => {
            // cleanup…
        });
    }
}

export default AudioSocketSessionFactory;
