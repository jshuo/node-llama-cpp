import { AsyncDisposeAggregator, EventRelay, withLock } from "lifecycle-utils";
import { tokenizeInput } from "../utils/tokenizeInput.js";
export class LlamaEmbeddingContext {
    /** @internal */ _llamaContext;
    /** @internal */ _sequence;
    /** @internal */ _disposeAggregator = new AsyncDisposeAggregator();
    onDispose = new EventRelay();
    constructor({ _llamaContext }) {
        this._llamaContext = _llamaContext;
        this._sequence = this._llamaContext.getSequence();
        this._disposeAggregator.add(this._llamaContext.onDispose.createListener(() => {
            void this._disposeAggregator.dispose();
        }));
        this._disposeAggregator.add(this.onDispose.dispatchEvent);
        this._disposeAggregator.add(async () => {
            await this._llamaContext.dispose();
        });
    }
    async getEmbeddingFor(input) {
        const resolvedInput = tokenizeInput(input, this._llamaContext.model.tokenizer);
        if (resolvedInput.length > this._llamaContext.contextSize)
            throw new Error("Input is longer than the context size. " +
                "Try to increase the context size or use another model that supports longer contexts.");
        else if (resolvedInput.length === 0)
            return {
                type: "embedding",
                vector: []
            };
        return await withLock(this, "evaluate", async () => {
            await this._sequence.eraseContextTokenRanges([{
                    start: 0,
                    end: this._sequence.nextTokenIndex
                }]);
            const iterator = this._sequence.evaluate(resolvedInput, { _noSampling: true });
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            for await (const token of iterator) {
                break; // only generate one token to get embeddings
            }
            const embedding = this._llamaContext._ctx.getEmbedding(resolvedInput.length);
            const embeddingVector = Array.from(embedding);
            return {
                type: "embedding",
                vector: embeddingVector
            };
        });
    }
    async dispose() {
        await this._disposeAggregator.dispose();
    }
    /** @hidden */
    [Symbol.asyncDispose]() {
        return this.dispose();
    }
    get disposed() {
        return this._llamaContext.disposed;
    }
    /** @internal */
    static async _create({ _model }, { contextSize, batchSize, threads = 6, createSignal, ignoreMemorySafetyChecks }) {
        const llamaContext = await _model.createContext({
            contextSize,
            batchSize,
            threads,
            createSignal,
            ignoreMemorySafetyChecks,
            _embeddings: true,
            _noSeed: true
        });
        return new LlamaEmbeddingContext({
            _llamaContext: llamaContext
        });
    }
}
//# sourceMappingURL=LlamaEmbeddingContext.js.map