/**
 * Grammar evaluation state is used to track the model response to determine the next allowed characters for the model to generate.
 * Create a new grammar evaluation state for every response you generate with the model.
 * This is only needed when using the `LlamaContext` class directly, as `LlamaChatSession` already handles this for you.
 */
export class LlamaGrammarEvaluationState {
    /** @internal */ _llama;
    /** @internal */ _state;
    /**
     * @param options
     */
    constructor({ grammar }) {
        this._llama = grammar._llama;
        this._state = new grammar._llama._bindings.AddonGrammarEvaluationState(grammar._grammar);
    }
}
//# sourceMappingURL=LlamaGrammarEvaluationState.js.map