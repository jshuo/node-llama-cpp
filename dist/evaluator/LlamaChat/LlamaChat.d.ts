import { EventRelay } from "lifecycle-utils";
import { ChatWrapper } from "../../ChatWrapper.js";
import { LlamaContextSequence } from "../LlamaContext/LlamaContext.js";
import { ChatHistoryItem, ChatModelFunctions, LLamaContextualRepeatPenalty, Token } from "../../types.js";
import { GbnfJsonSchemaToType } from "../../utils/gbnfJson/types.js";
import { LlamaGrammar } from "../LlamaGrammar.js";
import { LlamaText, LlamaTextJSON } from "../../utils/LlamaText.js";
import { EvaluationPriority } from "../LlamaContext/types.js";
import { TokenBias } from "../TokenBias.js";
export type LlamaChatOptions = {
    contextSequence: LlamaContextSequence;
    /** `"auto"` is used by default */
    chatWrapper?: "auto" | ChatWrapper;
    /** Automatically dispose the sequence when the session is disposed */
    autoDisposeSequence?: boolean;
};
export type LLamaChatGenerateResponseOptions<Functions extends ChatModelFunctions | undefined = undefined> = {
    /**
     * Called as the model generates a response with the generated text chunk.
     *
     * Useful for streaming the generated response as it's being generated.
     */
    onTextChunk?: (text: string) => void;
    /**
     * Called as the model generates a response with the generated tokens.
     *
     * Preferably, you'd want to use `onTextChunk` instead of this.
     */
    onToken?: (tokens: Token[]) => void;
    signal?: AbortSignal;
    /**
     * When a response already started being generated and then the signal is aborted,
     * the generation will stop and the response will be returned as is instead of throwing an error.
     *
     * Defaults to `false`.
     */
    stopOnAbortSignal?: boolean;
    maxTokens?: number;
    /**
     * Temperature is a hyperparameter that controls the randomness of the generated text.
     * It affects the probability distribution of the model's output tokens.
     * A higher temperature (e.g., 1.5) makes the output more random and creative,
     * while a lower temperature (e.g., 0.5) makes the output more focused, deterministic, and conservative.
     * The suggested temperature is 0.8, which provides a balance between randomness and determinism.
     * At the extreme, a temperature of 0 will always pick the most likely next token, leading to identical outputs in each run.
     *
     * Set to `0` to disable.
     * Disabled by default (set to `0`).
     */
    temperature?: number;
    /**
     * From the next token candidates, discard the percentage of tokens with the lowest probability.
     * For example, if set to `0.05`, 5% of the lowest probability tokens will be discarded.
     * This is useful for generating more high-quality results when using a high temperature.
     * Set to a value between `0` and `1` to enable.
     *
     * Only relevant when `temperature` is set to a value greater than `0`.
     * Disabled by default.
     */
    minP?: number;
    /**
     * Limits the model to consider only the K most likely next tokens for sampling at each step of sequence generation.
     * An integer number between `1` and the size of the vocabulary.
     * Set to `0` to disable (which uses the full vocabulary).
     *
     * Only relevant when `temperature` is set to a value greater than 0.
     */
    topK?: number;
    /**
     * Dynamically selects the smallest set of tokens whose cumulative probability exceeds the threshold P,
     * and samples the next token only from this set.
     * A float number between `0` and `1`.
     * Set to `1` to disable.
     *
     * Only relevant when `temperature` is set to a value greater than `0`.
     */
    topP?: number;
    /**
     * Trim whitespace from the end of the generated text
     *
     * Defaults to `false`.
     */
    trimWhitespaceSuffix?: boolean;
    repeatPenalty?: false | LLamaContextualRepeatPenalty;
    /**
     * Adjust the probability of tokens being generated.
     * Can be used to bias the model to generate tokens that you want it to lean towards,
     * or to avoid generating tokens that you want it to avoid.
     */
    tokenBias?: TokenBias | (() => TokenBias);
    /**
     * See the parameter `evaluationPriority` on the `LlamaContextSequence.evaluate()` function for more information.
     */
    evaluationPriority?: EvaluationPriority;
    contextShift?: LLamaChatContextShiftOptions;
    /**
     * Custom stop triggers to stop the generation of the response when any of the provided triggers are found.
     */
    customStopTriggers?: readonly (LlamaText | string | readonly (string | Token)[])[];
    /**
     * The evaluation context window returned from the last evaluation.
     * This is an optimization to utilize existing context sequence state better when possible.
     */
    lastEvaluationContextWindow?: {
        /** The history of the last evaluation. */
        history?: ChatHistoryItem[];
        /**
         * Minimum overlap percentage with existing context sequence state to use the last evaluation context window.
         * If the last evaluation context window is not used, a new context will be generated based on the full history,
         * which will decrease the likelihood of another context shift happening so soon.
         *
         * A number between `0` (exclusive) and `1` (inclusive).
         */
        minimumOverlapPercentageToPreventContextShift?: number;
    };
} & ({
    grammar?: LlamaGrammar;
    functions?: never;
    documentFunctionParams?: never;
    maxParallelFunctionCalls?: never;
    onFunctionCall?: never;
} | {
    grammar?: never;
    functions?: Functions | ChatModelFunctions;
    documentFunctionParams?: boolean;
    maxParallelFunctionCalls?: number;
    onFunctionCall?: (functionCall: LlamaChatResponseFunctionCall<Functions extends ChatModelFunctions ? Functions : ChatModelFunctions>) => void;
});
export type LLamaChatLoadAndCompleteUserMessageOptions<Functions extends ChatModelFunctions | undefined = undefined> = {
    /**
     * Complete the given user prompt without adding it or the completion to the returned context window.
     */
    initialUserPrompt?: string;
    /**
     * When a completion already started being generated and then the signal is aborted,
     * the generation will stop and the completion will be returned as is instead of throwing an error.
     *
     * Defaults to `false`.
     */
    stopOnAbortSignal?: boolean;
    /**
     * Called as the model generates a completion with the generated text chunk.
     *
     * Useful for streaming the generated completion as it's being generated.
     */
    onTextChunk?: LLamaChatGenerateResponseOptions<Functions>["onTextChunk"];
    /**
     * Called as the model generates a completion with the generated tokens.
     *
     * Preferably, you'd want to use `onTextChunk` instead of this.
     */
    onToken?: LLamaChatGenerateResponseOptions<Functions>["onToken"];
    signal?: LLamaChatGenerateResponseOptions<Functions>["signal"];
    maxTokens?: LLamaChatGenerateResponseOptions<Functions>["maxTokens"];
    temperature?: LLamaChatGenerateResponseOptions<Functions>["temperature"];
    minP?: LLamaChatGenerateResponseOptions<Functions>["minP"];
    topK?: LLamaChatGenerateResponseOptions<Functions>["topK"];
    topP?: LLamaChatGenerateResponseOptions<Functions>["topP"];
    trimWhitespaceSuffix?: LLamaChatGenerateResponseOptions<Functions>["trimWhitespaceSuffix"];
    repeatPenalty?: LLamaChatGenerateResponseOptions<Functions>["repeatPenalty"];
    tokenBias?: LLamaChatGenerateResponseOptions<Functions>["tokenBias"];
    evaluationPriority?: LLamaChatGenerateResponseOptions<Functions>["evaluationPriority"];
    contextShift?: LLamaChatGenerateResponseOptions<Functions>["contextShift"];
    customStopTriggers?: LLamaChatGenerateResponseOptions<Functions>["customStopTriggers"];
    lastEvaluationContextWindow?: LLamaChatGenerateResponseOptions<Functions>["lastEvaluationContextWindow"];
    grammar?: LlamaGrammar;
    /**
     * Functions are not used by the model here,
     * but are used for keeping the instructions given to the model about the functions in the current context state,
     * to avoid context shifts.
     *
     * It's best to provide the same functions that were used for the previous prompt here.
     */
    functions?: Functions | ChatModelFunctions;
    /**
     * Functions are not used by the model here,
     * but are used for keeping the instructions given to the model about the functions in the current context state,
     * to avoid context shifts.
     *
     * It's best to provide the same value that was used for the previous prompt here.
     */
    documentFunctionParams?: boolean;
};
export type LLamaChatContextShiftOptions = {
    /**
     * The number of tokens to delete from the context window to make space for new ones.
     * Defaults to 10% of the context size.
     */
    size?: number | ((sequence: LlamaContextSequence) => number | Promise<number>);
    /**
     * The strategy to use when deleting tokens from the context window.
     * Defaults to `"eraseFirstResponseAndKeepFirstSystem"`.
     */
    strategy?: "eraseFirstResponseAndKeepFirstSystem" | ((options: {
        chatHistory: ChatHistoryItem[];
        maxTokensCount: number;
        tokenizer(text: string, specialTokens?: boolean): Token[];
        chatWrapper: ChatWrapper;
        lastShiftMetadata?: object | null;
    }) => {
        chatHistory: ChatHistoryItem[];
        metadata?: object | null;
    } | Promise<{
        chatHistory: ChatHistoryItem[];
        metadata?: object | null;
    }>);
    /**
     * The `contextShiftMetadata` returned from the last evaluation.
     * This is an optimization to utilize the existing context state better when possible.
     */
    lastEvaluationMetadata?: object | undefined | null;
};
export declare class LlamaChat {
    readonly onDispose: EventRelay<void>;
    constructor({ contextSequence, chatWrapper, autoDisposeSequence }: LlamaChatOptions);
    dispose({ disposeSequence }?: {
        disposeSequence?: boolean;
    }): void;
    /** @hidden */
    [Symbol.dispose](): void;
    get disposed(): boolean;
    get chatWrapper(): ChatWrapper;
    get sequence(): LlamaContextSequence;
    get context(): import("../LlamaContext/LlamaContext.js").LlamaContext;
    get model(): import("../LlamaModel/LlamaModel.js").LlamaModel;
    generateResponse<const Functions extends ChatModelFunctions | undefined = undefined>(history: ChatHistoryItem[], options?: LLamaChatGenerateResponseOptions<Functions>): Promise<LlamaChatResponse<Functions>>;
    loadChatAndCompleteUserMessage<const Functions extends ChatModelFunctions | undefined = undefined>(history: ChatHistoryItem[], options?: LLamaChatLoadAndCompleteUserMessageOptions<Functions>): Promise<LlamaChatLoadAndCompleteUserResponse>;
}
export type LlamaChatResponse<Functions extends ChatModelFunctions | undefined = undefined> = {
    response: string;
    functionCalls?: Functions extends ChatModelFunctions ? LlamaChatResponseFunctionCall<Functions>[] : never;
    lastEvaluation: {
        cleanHistory: ChatHistoryItem[];
        contextWindow: ChatHistoryItem[];
        contextShiftMetadata: any;
    };
    metadata: {
        remainingGenerationAfterStop?: string | Token[];
        stopReason: "eogToken" | "stopGenerationTrigger" | "functionCalls" | "maxTokens" | "abort";
    } | {
        remainingGenerationAfterStop?: string | Token[];
        stopReason: "customStopTrigger";
        customStopTrigger: (string | Token)[];
    };
};
export type LlamaChatResponseFunctionCall<Functions extends ChatModelFunctions, FunctionCallName extends keyof Functions & string = string & keyof Functions, Params = Functions[FunctionCallName]["params"] extends undefined | null | void ? undefined : GbnfJsonSchemaToType<Functions[FunctionCallName]["params"]>> = {
    functionName: FunctionCallName;
    params: Params;
    raw: LlamaTextJSON;
};
export type LlamaChatLoadAndCompleteUserResponse = {
    completion: string;
    lastEvaluation: {
        /**
         * The completion and initial user prompt are not added to this context window result,
         * but are loaded to the current context sequence state as tokens
         */
        contextWindow: ChatHistoryItem[];
        contextShiftMetadata: any;
    };
    metadata: {
        remainingGenerationAfterStop?: string | Token[];
        stopReason: "eogToken" | "stopGenerationTrigger" | "maxTokens" | "abort";
    } | {
        remainingGenerationAfterStop?: string | Token[];
        stopReason: "customStopTrigger";
        customStopTrigger: (string | Token)[];
    };
};
