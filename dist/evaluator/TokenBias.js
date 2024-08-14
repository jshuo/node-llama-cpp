import { tokenizeInput } from "../utils/tokenizeInput.js";
export class TokenBias {
    /** @internal */ _model;
    /** @internal */ _biases = new Map();
    constructor(model) {
        this._model = model;
    }
    /**
     * Adjust the bias of the given token(s).
     * If a text is provided, the bias will be applied to each individual token in the text.
     * Setting a bias to `"never"` will prevent the token from being generated, unless it is required to comply with a grammar.
     * Setting the bias of the EOS or EOT tokens to `"never"` has no effect and will be ignored.
     * @param input - The token(s) to apply the bias to
     * @param bias - The bias to apply to the token(s).
     * Setting to a positive number increases the probability of the token(s) being generated.
     * Setting to a negative number decreases the probability of the token(s) being generated.
     * Setting to `0` has no effect.
     * Setting to `"never"` will prevent the token from being generated, unless it is required to comply with a grammar.
     * Try to play around with values between `10` and `-10` to see what works for your use case.
     * Fractional values are allowed and can be used to fine-tune the bias (for example, `1.123`).
     */
    set(input, bias) {
        for (const token of tokenizeInput(input, this._model.tokenizer))
            this._biases.set(token, bias === "never" ? -Infinity : bias);
        for (const token of tokenizeInput(input, this._model.tokenizer, "trimLeadingSpace"))
            this._biases.set(token, bias === "never" ? -Infinity : bias);
        return this;
    }
    static for(model) {
        return new TokenBias(model);
    }
}
//# sourceMappingURL=TokenBias.js.map