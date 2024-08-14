import { DisposeAggregator, DisposedError, EventRelay, withLock } from "lifecycle-utils";
import { appendUserMessageToChatHistory } from "../../utils/appendUserMessageToChatHistory.js";
import { LlamaChat } from "../LlamaChat/LlamaChat.js";
import { wrapAbortSignal } from "../../utils/wrapAbortSignal.js";
import { safeEventCallback } from "../../utils/safeEventCallback.js";
import { LlamaChatSessionPromptCompletionEngine } from "./utils/LlamaChatSessionPromptCompletionEngine.js";
export class LlamaChatSession {
    /** @internal */ _disposeAggregator = new DisposeAggregator();
    /** @internal */ _autoDisposeSequence;
    /** @internal */ _contextShift;
    /** @internal */ _chatLock = {};
    /** @internal */ _chatHistory;
    /** @internal */ _lastEvaluation;
    /** @internal */ _chat;
    /** @internal */ _chatHistoryStateRef = {};
    /** @internal */ _preloadAndCompleteAbortControllers = new Set();
    onDispose = new EventRelay();
    /**
     * @param options
     */
    constructor({ contextSequence, chatWrapper = "auto", systemPrompt, forceAddSystemPrompt = false, autoDisposeSequence = true, contextShift }) {
        if (contextSequence == null)
            throw new Error("contextSequence cannot be null");
        if (contextSequence.disposed)
            throw new DisposedError();
        this._contextShift = contextShift;
        this._chat = new LlamaChat({
            autoDisposeSequence,
            chatWrapper,
            contextSequence
        });
        const chatWrapperSupportsSystemMessages = this._chat.chatWrapper.settings.supportsSystemMessages;
        if (chatWrapperSupportsSystemMessages == null || chatWrapperSupportsSystemMessages || forceAddSystemPrompt)
            this._chatHistory = this._chat.chatWrapper.generateInitialChatHistory({ systemPrompt });
        else
            this._chatHistory = [];
        this._autoDisposeSequence = autoDisposeSequence;
        this._disposeAggregator.add(this._chat.onDispose.createListener(() => {
            this.dispose();
        }));
        this._disposeAggregator.add(this.onDispose.dispatchEvent);
    }
    dispose({ disposeSequence = this._autoDisposeSequence } = {}) {
        if (this._chat == null)
            return;
        this._chat.dispose({ disposeSequence });
        this._chat = null;
        this._disposeAggregator.dispose();
    }
    /** @hidden */
    [Symbol.dispose]() {
        return this.dispose();
    }
    get disposed() {
        return this._chat == null || this._chat.disposed;
    }
    get chatWrapper() {
        if (this._chat == null)
            throw new DisposedError();
        return this._chat.chatWrapper;
    }
    get sequence() {
        if (this._chat == null)
            throw new DisposedError();
        return this._chat.sequence;
    }
    get context() {
        return this.sequence.context;
    }
    get model() {
        return this.sequence.model;
    }
    /**
     * @param prompt
     * @param [options]
     */
    async prompt(prompt, { functions, documentFunctionParams, maxParallelFunctionCalls, onTextChunk, onToken, signal, stopOnAbortSignal = false, maxTokens, temperature, minP, topK, topP, grammar, trimWhitespaceSuffix = false, repeatPenalty, tokenBias, customStopTriggers } = {}) {
        const { responseText } = await this.promptWithMeta(prompt, {
            // this is a workaround to allow passing both `functions` and `grammar`
            functions: functions,
            documentFunctionParams: documentFunctionParams,
            maxParallelFunctionCalls: maxParallelFunctionCalls,
            onTextChunk, onToken, signal, stopOnAbortSignal, maxTokens, temperature, minP, topK, topP, grammar, trimWhitespaceSuffix,
            repeatPenalty, tokenBias, customStopTriggers
        });
        return responseText;
    }
    /**
     * @param prompt
     * @param [options]
     */
    async promptWithMeta(prompt, { functions, documentFunctionParams, maxParallelFunctionCalls, onTextChunk, onToken, signal, stopOnAbortSignal = false, maxTokens, temperature, minP, topK, topP, grammar, trimWhitespaceSuffix = false, repeatPenalty, tokenBias, customStopTriggers, evaluationPriority } = {}) {
        this._ensureNotDisposed();
        if (grammar != null && grammar._llama !== this.model._llama)
            throw new Error("The LlamaGrammar used by passed to this function was created with a different Llama instance than the one used by this sequence's model. Make sure you use the same Llama instance for both the model and the grammar.");
        this._stopAllPreloadAndPromptCompletions();
        return await withLock(this._chatLock, "evaluation", signal, async () => {
            this._ensureNotDisposed();
            this._stopAllPreloadAndPromptCompletions();
            if (this._chat == null)
                throw new DisposedError();
            const supportsParallelFunctionCalling = this._chat.chatWrapper.settings.functions.parallelism != null;
            const abortController = wrapAbortSignal(signal);
            let lastEvaluation = this._lastEvaluation;
            let newChatHistory = appendUserMessageToChatHistory(this._chatHistory, prompt);
            let newContextWindowChatHistory = lastEvaluation?.contextWindow == null
                ? undefined
                : appendUserMessageToChatHistory(lastEvaluation?.contextWindow, prompt);
            newChatHistory.push({
                type: "model",
                response: []
            });
            if (newContextWindowChatHistory != null)
                newContextWindowChatHistory.push({
                    type: "model",
                    response: []
                });
            // eslint-disable-next-line no-constant-condition
            while (true) {
                const functionCallsAndResults = [];
                let canThrowFunctionCallingErrors = false;
                let abortedOnFunctionCallError = false;
                const initialOutputTokens = this._chat.sequence.tokenMeter.usedOutputTokens;
                const { lastEvaluation: currentLastEvaluation, metadata } = await this._chat.generateResponse(newChatHistory, {
                    functions,
                    documentFunctionParams,
                    maxParallelFunctionCalls,
                    grammar: grammar, // this is a workaround to allow passing both `functions` and `grammar`
                    onTextChunk: safeEventCallback(onTextChunk),
                    onToken: safeEventCallback(onToken),
                    signal: abortController.signal,
                    stopOnAbortSignal,
                    repeatPenalty,
                    minP,
                    topK,
                    topP,
                    tokenBias,
                    customStopTriggers,
                    maxTokens,
                    temperature,
                    trimWhitespaceSuffix,
                    contextShift: {
                        ...this._contextShift,
                        lastEvaluationMetadata: lastEvaluation?.contextShiftMetadata
                    },
                    evaluationPriority,
                    lastEvaluationContextWindow: {
                        history: newContextWindowChatHistory,
                        minimumOverlapPercentageToPreventContextShift: 0.5
                    },
                    onFunctionCall: async (functionCall) => {
                        functionCallsAndResults.push((async () => {
                            try {
                                const functionDefinition = functions?.[functionCall.functionName];
                                if (functionDefinition == null)
                                    throw new Error(`The model tried to call function "${functionCall.functionName}" which is not defined`);
                                const functionCallResult = await functionDefinition.handler(functionCall.params);
                                return {
                                    functionCall,
                                    functionDefinition,
                                    functionCallResult
                                };
                            }
                            catch (err) {
                                if (!abortController.signal.aborted) {
                                    abortedOnFunctionCallError = true;
                                    abortController.abort(err);
                                }
                                if (canThrowFunctionCallingErrors)
                                    throw err;
                                return null;
                            }
                        })());
                    }
                });
                this._ensureNotDisposed();
                if (abortController.signal.aborted && (abortedOnFunctionCallError || !stopOnAbortSignal))
                    throw abortController.signal.reason;
                if (maxTokens != null)
                    maxTokens = Math.max(0, maxTokens - (this._chat.sequence.tokenMeter.usedOutputTokens - initialOutputTokens));
                lastEvaluation = currentLastEvaluation;
                newChatHistory = lastEvaluation.cleanHistory;
                if (functionCallsAndResults.length > 0) {
                    canThrowFunctionCallingErrors = true;
                    const functionCallResultsPromise = Promise.all(functionCallsAndResults);
                    await Promise.race([
                        functionCallResultsPromise,
                        new Promise((accept, reject) => {
                            abortController.signal.addEventListener("abort", () => {
                                if (abortedOnFunctionCallError || !stopOnAbortSignal)
                                    reject(abortController.signal.reason);
                                else
                                    accept();
                            });
                            if (abortController.signal.aborted) {
                                if (abortedOnFunctionCallError || !stopOnAbortSignal)
                                    reject(abortController.signal.reason);
                                else
                                    accept();
                            }
                        })
                    ]);
                    this._ensureNotDisposed();
                    if (!abortController.signal.aborted) {
                        const functionCallResults = (await functionCallResultsPromise)
                            .filter((result) => result != null);
                        this._ensureNotDisposed();
                        if (abortController.signal.aborted)
                            throw abortController.signal.reason;
                        newContextWindowChatHistory = lastEvaluation.contextWindow;
                        let startNewChunk = supportsParallelFunctionCalling;
                        for (const { functionCall, functionDefinition, functionCallResult } of functionCallResults) {
                            newChatHistory = addFunctionCallToChatHistory({
                                chatHistory: newChatHistory,
                                functionName: functionCall.functionName,
                                functionDescription: functionDefinition.description,
                                callParams: functionCall.params,
                                callResult: functionCallResult,
                                rawCall: functionCall.raw,
                                startsNewChunk: startNewChunk
                            });
                            newContextWindowChatHistory = addFunctionCallToChatHistory({
                                chatHistory: newContextWindowChatHistory,
                                functionName: functionCall.functionName,
                                functionDescription: functionDefinition.description,
                                callParams: functionCall.params,
                                callResult: functionCallResult,
                                rawCall: functionCall.raw,
                                startsNewChunk: startNewChunk
                            });
                            startNewChunk = false;
                        }
                        lastEvaluation.cleanHistory = newChatHistory;
                        lastEvaluation.contextWindow = newContextWindowChatHistory;
                        continue;
                    }
                }
                this._lastEvaluation = lastEvaluation;
                this._chatHistory = newChatHistory;
                this._chatHistoryStateRef = {};
                const lastModelResponseItem = getLastModelResponseItem(newChatHistory);
                const responseText = lastModelResponseItem.response
                    .filter((item) => typeof item === "string")
                    .join("");
                if (metadata.stopReason === "customStopTrigger")
                    return {
                        response: lastModelResponseItem.response,
                        responseText,
                        stopReason: metadata.stopReason,
                        customStopTrigger: metadata.customStopTrigger,
                        remainingGenerationAfterStop: metadata.remainingGenerationAfterStop
                    };
                return {
                    response: lastModelResponseItem.response,
                    responseText,
                    stopReason: metadata.stopReason,
                    remainingGenerationAfterStop: metadata.remainingGenerationAfterStop
                };
            }
        });
    }
    /**
     * Preload a user prompt into the current context sequence state to make later inference of the model response begin sooner
     * and feel faster.
     *
     * > **Note:** Preloading a long user prompt can incur context shifts, so consider limiting the length of prompts you preload
     * @param prompt - the prompt to preload
     * @param [options]
     */
    async preloadPrompt(prompt, options = {}) {
        await this.completePromptWithMeta(prompt, {
            ...options,
            maxTokens: 0
        });
    }
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
    async completePrompt(prompt, options = {}) {
        const { completion } = await this.completePromptWithMeta(prompt, options);
        return completion;
    }
    /**
     * Create a smart completion engine that caches the prompt completions
     * and reuses them when the user prompt matches the beginning of the cached prompt or completion.
     *
     * All completions are made and cache is used only for the current chat session state.
     * You can create a single completion engine for an entire chat session.
     */
    createPromptCompletionEngine(options) {
        return LlamaChatSessionPromptCompletionEngine._create(this, options);
    }
    /**
     * See `completePrompt` for more information.
     * @param prompt
     * @param [options]
     */
    async completePromptWithMeta(prompt, { maxTokens, stopOnAbortSignal = false, functions, documentFunctionParams, onTextChunk, onToken, signal, temperature, minP, topK, topP, grammar, trimWhitespaceSuffix = false, repeatPenalty, tokenBias, customStopTriggers, evaluationPriority } = {}) {
        this._ensureNotDisposed();
        if (grammar != null && grammar._llama !== this.model._llama)
            throw new Error("The LlamaGrammar used by passed to this function was created with a different Llama instance than the one used by this sequence's model. Make sure you use the same Llama instance for both the model and the grammar.");
        const abortController = wrapAbortSignal(signal);
        this._preloadAndCompleteAbortControllers.add(abortController);
        try {
            return await withLock(this._chatLock, "evaluation", abortController.signal, async () => {
                this._ensureNotDisposed();
                if (this._chat == null)
                    throw new DisposedError();
                const { completion, lastEvaluation, metadata } = await this._chat.loadChatAndCompleteUserMessage(this._chatHistory, {
                    initialUserPrompt: prompt,
                    functions,
                    documentFunctionParams,
                    grammar,
                    onTextChunk,
                    onToken,
                    signal: abortController.signal,
                    stopOnAbortSignal: true,
                    repeatPenalty,
                    minP,
                    topK,
                    topP,
                    tokenBias,
                    customStopTriggers,
                    maxTokens,
                    temperature,
                    trimWhitespaceSuffix,
                    contextShift: {
                        ...this._contextShift,
                        lastEvaluationMetadata: this._lastEvaluation?.contextShiftMetadata
                    },
                    evaluationPriority,
                    lastEvaluationContextWindow: {
                        history: this._lastEvaluation?.contextWindow,
                        minimumOverlapPercentageToPreventContextShift: 0.8
                    }
                });
                this._ensureNotDisposed();
                this._lastEvaluation = {
                    cleanHistory: this._chatHistory,
                    contextWindow: lastEvaluation.contextWindow,
                    contextShiftMetadata: lastEvaluation.contextShiftMetadata
                };
                if (!stopOnAbortSignal && metadata.stopReason === "abort" && abortController.signal?.aborted)
                    throw abortController.signal.reason;
                if (metadata.stopReason === "customStopTrigger")
                    return {
                        completion: completion,
                        stopReason: metadata.stopReason,
                        customStopTrigger: metadata.customStopTrigger,
                        remainingGenerationAfterStop: metadata.remainingGenerationAfterStop
                    };
                return {
                    completion: completion,
                    stopReason: metadata.stopReason,
                    remainingGenerationAfterStop: metadata.remainingGenerationAfterStop
                };
            });
        }
        finally {
            this._preloadAndCompleteAbortControllers.delete(abortController);
        }
    }
    getChatHistory() {
        return structuredClone(this._chatHistory);
    }
    getLastEvaluationContextWindow() {
        if (this._lastEvaluation == null)
            return null;
        return structuredClone(this._lastEvaluation?.contextWindow);
    }
    setChatHistory(chatHistory) {
        this._chatHistory = structuredClone(chatHistory);
        this._chatHistoryStateRef = {};
        this._lastEvaluation = undefined;
    }
    /** @internal */
    _stopAllPreloadAndPromptCompletions() {
        for (const abortController of this._preloadAndCompleteAbortControllers)
            abortController.abort();
        this._preloadAndCompleteAbortControllers.clear();
    }
    /** @internal */
    _ensureNotDisposed() {
        if (this.disposed)
            throw new DisposedError();
    }
}
function addFunctionCallToChatHistory({ chatHistory, functionName, functionDescription, callParams, callResult, rawCall, startsNewChunk }) {
    const newChatHistory = chatHistory.slice();
    if (newChatHistory.length === 0 || newChatHistory[newChatHistory.length - 1].type !== "model")
        newChatHistory.push({
            type: "model",
            response: []
        });
    const lastModelResponseItem = newChatHistory[newChatHistory.length - 1];
    const newLastModelResponseItem = { ...lastModelResponseItem };
    newChatHistory[newChatHistory.length - 1] = newLastModelResponseItem;
    const modelResponse = newLastModelResponseItem.response.slice();
    newLastModelResponseItem.response = modelResponse;
    const functionCall = {
        type: "functionCall",
        name: functionName,
        description: functionDescription,
        params: callParams,
        result: callResult,
        rawCall
    };
    if (startsNewChunk)
        functionCall.startsNewChunk = true;
    modelResponse.push(functionCall);
    return newChatHistory;
}
function getLastModelResponseItem(chatHistory) {
    if (chatHistory.length === 0 || chatHistory[chatHistory.length - 1].type !== "model")
        throw new Error("Expected chat history to end with a model response");
    return chatHistory[chatHistory.length - 1];
}
//# sourceMappingURL=LlamaChatSession.js.map