/**
 * Tracks the evaluation usage of tokens.
 */
export class TokenMeter {
    _inputTokens = 0;
    _outputTokens = 0;
    _restoreStateTokens = 0;
    /**
     * The number of input tokens used
     */
    get usedInputTokens() {
        return this._inputTokens;
    }
    /**
     * The number of tokens generated by a model
     */
    get usedOutputTokens() {
        return this._outputTokens;
    }
    /**
     * The number of tokens used as input to restore a context sequence state to continue previous evaluation.
     * This may be consumed by virtual context sequences.
     */
    get usedRestoreStateTokens() {
        return this._restoreStateTokens;
    }
    /**
     * Get the current state of the token meter
     */
    getState() {
        return {
            usedInputTokens: this.usedInputTokens,
            usedOutputTokens: this.usedOutputTokens,
            usedRestoreStateTokens: this.usedRestoreStateTokens
        };
    }
    /**
     * Log the usage of tokens
     */
    useTokens(tokens, type) {
        if (tokens < 0)
            throw new RangeError("Tokens cannot be negative");
        else if (tokens === 0)
            return;
        if (type === "input")
            this._inputTokens += tokens;
        else if (type === "output")
            this._outputTokens += tokens;
        else if (type === "restoreState")
            this._restoreStateTokens += tokens;
        else {
            void type;
            throw new TypeError(`Unknown token type: ${type}`);
        }
    }
    /**
     * Get the difference between the current meter and another meter
     */
    diff(meter) {
        return TokenMeter.diff(this, meter);
    }
    /**
     * Log the usage of tokens on multiple meters
     */
    static useTokens(meters, tokens, type) {
        if (meters == null)
            return;
        if (meters instanceof TokenMeter)
            meters.useTokens(tokens, type);
        else {
            for (const meter of meters)
                meter.useTokens(tokens, type);
        }
    }
    /**
     * Get the difference between two meters
     */
    static diff(meter1, meter2) {
        return {
            usedInputTokens: meter1.usedInputTokens - meter2.usedInputTokens,
            usedOutputTokens: meter1.usedOutputTokens - meter2.usedOutputTokens,
            usedRestoreStateTokens: meter1.usedRestoreStateTokens - meter2.usedRestoreStateTokens
        };
    }
}
//# sourceMappingURL=TokenMeter.js.map