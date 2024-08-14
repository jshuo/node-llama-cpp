import { EventRelay } from "lifecycle-utils";
import { Token } from "../../types.js";
import { LlamaGrammarEvaluationState } from "../LlamaGrammarEvaluationState.js";
import { TokenMeter } from "../TokenMeter.js";
import { TokenBias } from "../TokenBias.js";
import { LlamaModel } from "../LlamaModel/LlamaModel.js";
import { ContextShiftOptions, ContextTokensDeleteRange, EvaluationPriority, LlamaContextSequenceRepeatPenalty } from "./types.js";
export declare class LlamaContext {
    readonly onDispose: EventRelay<void>;
    private constructor();
    dispose(): Promise<void>;
    /** @hidden */
    [Symbol.asyncDispose](): Promise<void>;
    get disposed(): boolean;
    get model(): LlamaModel;
    get contextSize(): number;
    get batchSize(): number;
    get flashAttention(): boolean;
    /**
     * The actual size of the state in the memory in bytes.
     * This value is provided by `llama.cpp` and doesn't include all the memory overhead of the context.
     */
    get stateSize(): number;
    getAllocatedContextSize(): number;
    get totalSequences(): number;
    get sequencesLeft(): number;
    /**
     * Before calling this method, make sure to call `sequencesLeft` to check if there are any sequences left.
     * When there are no sequences left, this method will throw an error.
     */
    getSequence(options?: {
        contextShift?: ContextShiftOptions;
    }): LlamaContextSequence;
    dispatchPendingBatch(): void;
    /**
     * Print the timings of token evaluation since that last print for this context.
     * > **Note:** it prints on the `LlamaLogLevel.info` level, so if you set the level of your `Llama` instance higher than that,
     * it won't print anything.
     */
    printTimings(): Promise<void>;
}
export declare class LlamaContextSequence {
    readonly onDispose: EventRelay<void>;
    private constructor();
    dispose(): void;
    /** @hidden */
    [Symbol.dispose](): void;
    get disposed(): boolean;
    get context(): LlamaContext;
    get model(): LlamaModel;
    get nextTokenIndex(): number;
    get contextTokens(): Token[];
    get tokenMeter(): TokenMeter;
    get isLoadedToMemory(): boolean;
    compareContextTokens(tokens: Token[]): {
        firstDifferentIndex: number;
    };
    /**
     * Clear the history of the sequence.
     * If `prependBos` was enabled, the BOS token will be prepended to the sequence again.
     */
    clearHistory(): Promise<void>;
    /**
     * Erase context tokens in the provided ranges to free up space for new tokens to be generated.
     * The start of each range is inclusive, and the end of each range is exclusive.
     * For example, the range `{start: 0, end: 1}` will remove the token at the `0` index only.
     */
    eraseContextTokenRanges(ranges: ContextTokensDeleteRange[]): Promise<void>;
    evaluate(tokens: Token[], options?: {
        temperature?: number;
        minP?: number;
        topK?: number;
        topP?: number;
        grammarEvaluationState?: LlamaGrammarEvaluationState | (() => LlamaGrammarEvaluationState | undefined);
        repeatPenalty?: LlamaContextSequenceRepeatPenalty;
        /**
         * Adjust the probability of tokens being generated.
         * Can be used to bias the model to generate tokens that you want it to lean towards,
         * or to avoid generating tokens that you want it to avoid.
         */
        tokenBias?: TokenBias | (() => TokenBias);
        /**
         * When a lot of tokens are queued for the next batch, more than the configured `batchSize`, the tokens for each sequence will be
         * evaluated based on the strategy chosen for the context.
         * By default, the `"maximumParallelism"` strategy is used, which will try to evaluate as many sequences in parallel as possible,
         * but at some point, it'll have to choose which sequences to evaluate more tokens of, so it'll prioritize the sequences with the
         * highest evaluation priority.
         * Also, a custom strategy can be used to prioritize the sequences differently, but generally, the higher the evaluation priority
         * is, the more likely and more tokens will be evaluated for that sequence in the next queued batch.
         */
        evaluationPriority?: EvaluationPriority;
        /** Override the sequence context shift options for this evaluation */
        contextShift?: ContextShiftOptions;
        /**
         * Yield an EOG (End Of Generation) token (like EOS and EOT) when it's generated.
         * When `false` the generation will stop when an EOG token is generated and the token won't be yielded.
         * Defaults to `false`.
         */
        yieldEogToken?: boolean;
    }): AsyncGenerator<Token, void | Token>;
    /**
     * Evaluate the provided tokens into the context sequence without generating new tokens.
     * @param tokens
     * @param [options]
     */
    evaluateWithoutGeneratingNewTokens(tokens: Token[], { evaluationPriority, contextShift: { size: contextShiftSize, strategy: contextShiftStrategy } }?: {
        /**
         * When a lot of tokens are queued for the next batch, more than the configured `batchSize`, the tokens for each sequence will be
         * evaluated based on the strategy chosen for the context.
         * By default, the `"maximumParallelism"` strategy is used, which will try to evaluate as many sequences in parallel as possible,
         * but at some point, it'll have to choose which sequences to evaluate more tokens of, so it'll prioritize the sequences with the
         * highest evaluation priority.
         * Also, a custom strategy can be used to prioritize the sequences differently, but generally, the higher the evaluation priority
         * is, the more likely and more tokens will be evaluated for that sequence in the next queued batch.
         */
        evaluationPriority?: EvaluationPriority;
        /** Override the sequence context shift options for this evaluation */
        contextShift?: ContextShiftOptions;
    }): Promise<void>;
}
export declare function getDefaultContextBatchSize({ contextSize, sequences }: {
    contextSize: number;
    sequences: number;
}): number;
export declare function getDefaultContextSequences(): number;
export declare function getDefaultModelContextSize({ trainContextSize }: {
    trainContextSize?: number;
}): number;
