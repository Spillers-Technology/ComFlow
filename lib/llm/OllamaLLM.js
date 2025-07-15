// aiworker/lib/llm/OllamaLLM.js
import fetch from "node-fetch";

/**
 * OllamaLLM wraps calls to an Ollama API for text completion.
 */
export class OllamaLLM {
    /**
     * @param {{ url: string, model?: string, logger?: object }} options
     */
    constructor({ url, model = "gpt-4o-mini", logger } = {}) {
        this.url = url;
        this.model = model;
        this.logger = logger;
    }

    /**
     * Queries the LLM for a completion.
     * @param {string} prompt - The input prompt for the model.
     * @returns {Promise<string>} - The model's response text.
     */
    async query(prompt) {
        this.logger.visit("OllamaLLM", `Sending prompt to model ${this.model}`);

        const body = JSON.stringify({
            model: this.model,
            prompt,
            stream: false,
        });

        const response = await fetch(`${this.url}/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
        });

        if (!response.ok) {
            const errText = await response.text();
            this.logger.visit(
                "OllamaLLM",
                `LLM request failed: ${errText}`,
                "ERROR",
            );
            throw new Error(`Ollama API error: ${response.status}`);
        }

        const data = await response.json();
        const text = data.choices?.[0]?.text?.trim();
        this.logger.visit("OllamaLLM", "Received LLM response");
        return text;
    }
}
