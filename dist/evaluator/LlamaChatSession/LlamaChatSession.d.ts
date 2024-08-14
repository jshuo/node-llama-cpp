import { EventRelay } from "lifecycle-utils";
import { ChatWrapper } from "../../ChatWrapper.js";
import { ChatHistoryItem, ChatModelFunctionCall, ChatSessionModelFunctions, Token } from "../../types.js";
import { LlamaContextSequence } from "../LlamaContext/LlamaContext.js";
import { LlamaGrammar } from "../LlamaGrammar.js";
import { LLamaChatContextShiftOptions } from "../LlamaChat/LlamaChat.js";
import { EvaluationPriority } from "../LlamaContext/types.js";
import { TokenBias } from "../TokenBias.js";
import { LlamaText } from "../../utils/LlamaText.js";
import { LLamaChatPromptCompletionEngineOptions, LlamaChatSessionPromptCompletionEngine } from "./utils/LlamaChatSessionPromptCompletionEngine.js";
export type LlamaChatSessionOptions = {
    contextSequence: LlamaContextSequence;
    /** `"auto"` is used by default */
    chatWrapper?: "auto" | ChatWrapper;
    systemPrompt?: string;
    /**
     * Add the system prompt even on models that don't support a system prompt.
     *
     * Each chat wrapper has its own workaround for adding a system prompt to a model that doesn't support it,
     * but forcing the system prompt on unsupported models may not always work as expected.
     *
     * Use with caution.
     */
    forceAddSystemPrompt?: boolean;
    /** Automatically dispose the sequence when the session is disposed */
    autoDisposeSequence?: boolean;
    contextShift?: LlamaChatSessionContextShiftOptions;
};
export type LlamaChatSessionContextShiftOptions = {
    /**
     * The number of tokens to delete from the context window to make space for new ones.
     * Defaults to 10% of the context size.
     */
    size?: LLamaChatContextShiftOptions["size"];
    /**
     * The strategy to use when deleting tokens from the context window.
     * Defaults to `"eraseFirstResponseAndKeepFirstSystem"`.
     */
    strategy?: LLamaChatContextShiftOptions["strategy"];
};
export type LLamaChatPromptOptions<Functions extends ChatSessionModelFunctions | undefined = ChatSessionModelFunctions | undefined> = {
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
     * Disabled by default.
     */
    trimWhitespaceSuffix?: boolean;
    /**
     * See the parameter `evaluationPriority` on the `LlamaContextSequence.evaluate()` function for more information.
     */
    evaluationPriority?: EvaluationPriority;
    repeatPenalty?: false | LlamaChatSessionRepeatPenalty;
    /**
     * Adjust the probability of tokens being generated.
     * Can be used to bias the model to generate tokens that you want it to lean towards,
     * or to avoid generating tokens that you want it to avoid.
     */
    tokenBias?: TokenBias | (() => TokenBias);
    /**
     * Custom stop triggers to stop the generation of the response when any of the provided triggers are found.
     */
    customStopTriggers?: (LlamaText | string | (string | Token)[])[];
} & ({
    grammar?: LlamaGrammar;
    functions?: never;
    documentFunctionParams?: never;
    maxParallelFunctionCalls?: never;
} | {
    grammar?: never;
    functions?: Functions | ChatSessionModelFunctions;
    documentFunctionParams?: boolean;
    maxParallelFunctionCalls?: number;
});
export type LLamaChatCompletePromptOptions = {
    /**
     * Generate a completion for the given user prompt up to the given number of tokens.
     *
     * Defaults to `256` or half the context size, whichever is smaller.
     */
    maxTokens?: LLamaChatPromptOptions["maxTokens"];
    /**
     * When a completion already started being generated and then the signal is aborted,
     * the generation will stop and the completion will be returned as is instead of throwing an error.
     *
     * Defaults to `false`.
     */
    stopOnAbortSignal?: LLamaChatPromptOptions["stopOnAbortSignal"];
    /**
     * Called as the model generates a completion with the generated text chunk.
     *
     * Useful for streaming the generated completion as it's being generated.
     */
    onTextChunk?: LLamaChatPromptOptions["onTextChunk"];
    /**
     * Called as the model generates a completion with the generated tokens.
     *
     * Preferably, you'd want to use `onTextChunk` instead of this.
     */
    onToken?: LLamaChatPromptOptions["onToken"];
    signal?: LLamaChatPromptOptions["signal"];
    temperature?: LLamaChatPromptOptions["temperature"];
    minP?: LLamaChatPromptOptions["minP"];
    topK?: LLamaChatPromptOptions["topK"];
    topP?: LLamaChatPromptOptions["topP"];
    trimWhitespaceSuffix?: LLamaChatPromptOptions["trimWhitespaceSuffix"];
    evaluationPriority?: LLamaChatPromptOptions["evaluationPriority"];
    repeatPenalty?: LLamaChatPromptOptions["repeatPenalty"];
    tokenBias?: LLamaChatPromptOptions["tokenBias"];
    customStopTriggers?: LLamaChatPromptOptions["customStopTriggers"];
    grammar?: LlamaGrammar;
    /**
     * Functions are not used by the model here,
     * but are used for keeping the instructions given to the model about the functions in the current context state,
     * to avoid context shifts.
     *
     * It's best to provide the same functions that were used for the previous prompt here.
     */
    functions?: ChatSessionModelFunctions;
    /**
     * Functions are not used by the model here,
     * but are used for keeping the instructions given to the model about the functions in the current context state,
     * to avoid context shifts.
     *
     * It's best to provide the same value that was used for the previous prompt here.
     */
    documentFunctionParams?: boolean;
};
export type LLamaChatPreloadPromptOptions = {
    signal?: LLamaChatCompletePromptOptions["signal"];
    evaluationPriority?: LLamaChatCompletePromptOptions["evaluationPriority"];
    functions?: LLamaChatCompletePromptOptions["functions"];
    documentFunctionParams?: LLamaChatCompletePromptOptions["documentFunctionParams"];
};
export type LlamaChatSessionRepeatPenalty = {
    /**
     * Number of recent tokens generated by the model to apply penalties to repetition of.
     * Defaults to `64`.
     */
    lastTokens?: number;
    punishTokensFilter?: (tokens: Token[]) => Token[];
    /**
     * Penalize new line tokens.
     * Enabled by default.
     */
    penalizeNewLine?: boolean;
    /**
     * The relative amount to lower the probability of the tokens in `punishTokens` by
     * Defaults to `1.1`.
     * Set to `1` to disable.
     */
    penalty?: number;
    /**
     * For n time a token is in the `punishTokens` array, lower its probability by `n * frequencyPenalty`
     * Disabled by default (`0`).
     * Set to a value between `0` and `1` to enable.
     */
    frequencyPenalty?: number;
    /**
     * Lower the probability of all the tokens in the `punishTokens` array by `presencePenalty`
     * Disabled by default (`0`).
     * Set to a value between `0` and `1` to enable.
     */
    presencePenalty?: number;
};
export declare class LlamaChatSession {
    readonly onDispose: EventRelay<void>;
    /**
     * @param options
     */
    constructor({ contextSequence, chatWrapper, systemPrompt, forceAddSystemPrompt, autoDisposeSequence, contextShift }: LlamaChatSessionOptions);
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
    /**
     * @param prompt
     * @param [options]
     */
    prompt<const Functions extends ChatSessionModelFunctions | undefined = undefined>(prompt: string, { functions, documentFunctionParams, maxParallelFunctionCalls, onTextChunk, onToken, signal, stopOnAbortSignal, maxTokens, temperature, minP, topK, topP, grammar, trimWhitespaceSuffix, repeatPenalty, tokenBias, customStopTriggers }?: LLamaChatPromptOptions<Functions>): Promise<string>;
    /**
     * @param prompt
     * @param [options]
     */
    promptWithMeta<const Functions extends ChatSessionModelFunctions | undefined = undefined>(prompt: string, { functions, documentFunctionParams, maxParallelFunctionCalls, onTextChunk, onToken, signal, stopOnAbortSignal, maxTokens, temperature, minP, topK, topP, grammar, trimWhitespaceSuffix, repeatPenalty, tokenBias, customStopTriggers, evaluationPriority }?: LLamaChatPromptOptions<Functions>): Promise<{
        response: (string | ChatModelFunctionCall)[];
        responseText: string;
        stopReason: "customStopTrigger";
        customStopTrigger: (string | Token)[];
        remainingGenerationAfterStop: string | Token[] | undefined;
    } | {
        response: (string | ChatModelFunctionCall)[];
        responseText: string;
        stopReason: "abort" | "maxTokens" | "eogToken" | "stopGenerationTrigger" | "functionCalls";
        remainingGenerationAfterStop: string | Token[] | undefined;
        customStopTrigger?: undefined;
    }>;
    /**
     * Preload a user prompt into the current context sequence state to make later inference of the model response begin sooner
     * and feel faster.
     *
     * > **Note:** Preloading a long user prompt can incur context shifts, so consider limiting the length of prompts you preload
     * @param prompt - the prompt to preload
     * @param [options]
     */
    preloadPrompt(prompt: string, options?: LLamaChatPreloadPromptOptions): Promise<void>;
    /**
     * Preload a user prompt into the current context sequence state and generate a completion for it.
     *
     * > **Note:** Preloading a long user prompt and completing a user prompt with a high number of `maxTokens` can incur context shifts,
     * > so consider limiting the length of prompts you preload.
     * >
     * > Also, it's recommended to limit the number of tokens generated to a reasonable amount by configuring `maxTokens`.
     * @param prompt - the prompt to preload
     * @param [options]
     */
    completePrompt(prompt: string, options?: LLamaChatCompletePromptOptions): Promise<string>;
    /**
     * Create a smart completion engine that caches the prompt completions
     * and reuses them when the user prompt matches the beginning of the cached prompt or completion.
     *
     * All completions are made and cache is used only for the current chat session state.
     * You can create a single completion engine for an entire chat session.
     */
    createPromptCompletionEngine(options?: LLamaChatPromptCompletionEngineOptions): LlamaChatSessionPromptCompletionEngine;
    /**
     * See `completePrompt` for more information.
     * @param prompt
     * @param [options]
     */
    completePromptWithMeta(prompt: string, { maxTokens, stopOnAbortSignal, functions, documentFunctionParams, onTextChunk, onToken, signal, temperature, minP, topK, topP, grammar, trimWhitespaceSuffix, repeatPenalty, tokenBias, customStopTriggers, evaluationPriority }?: LLamaChatCompletePromptOptions): Promise<{
        completion: string;
        stopReason: "customStopTrigger";
        customStopTrigger: (string | Token)[];
        remainingGenerationAfterStop: string | Token[] | undefined;
    } | {
        completion: string;
        stopReason: "abort" | "maxTokens" | "eogToken" | "stopGenerationTrigger";
        remainingGenerationAfterStop: string | Token[] | undefined;
        customStopTrigger?: undefined;
    }>;
    getChatHistory(): ChatHistoryItem[];
    getLastEvaluationContextWindow(): ChatHistoryItem[] | null;
    setChatHistory(chatHistory: ChatHistoryItem[]): void;
}
