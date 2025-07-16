// observer/EventBus.js

/**
 * Simple pub/sub event bus with on, off, and emit methods.
 */
export class EventBus {
    constructor() {
        this.listeners = {};
    }

    /**
     * Subscribe to an event.
     * @param {string} event - Event name.
     * @param {Function} fn - Callback to invoke when the event is emitted.
     * @returns {Function} unsubscribe function.
     */
    on(event, fn) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(fn);
        // Return unsubscribe function
        return () => this.off(event, fn);
    }

    /**
     * Unsubscribe a function from an event.
     * @param {string} event - Event name.
     * @param {Function} fn - Callback to remove.
     */
    off(event, fn) {
        const fns = this.listeners[event];
        if (!fns) return;
        this.listeners[event] = fns.filter((listener) => listener !== fn);
    }

    /**
     * Emit an event to all subscribers.
     * @param {string} event - Event name.
     * @param {*} payload - Data to pass to callbacks.
     */
    emit(event, payload) {
        const fns = this.listeners[event] || [];
        for (const fn of fns.slice()) {
            try {
                fn(payload);
            } catch (err) {
                console.error(
                    `EventBus error in listener for '${event}':`,
                    err,
                );
            }
        }
    }
}
