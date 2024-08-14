import { DisposeAggregator, DisposedError, EventRelay, withLock } from "lifecycle-utils";
import { removeNullFields } from "../../utils/removeNullFields.js";
import { LlamaGrammarEvaluationState } from "../LlamaGrammarEvaluationState.js";
import { LlamaText, SpecialToken } from "../../utils/LlamaText.js";
import { StopGenerationDetector } from "../../utils/StopGenerationDetector.js";
import { TokenStreamRegulator } from "../../utils/TokenStreamRegulator.js";
import { maxRecentDetokenizerTokens, UNKNOWN_UNICODE_CHAR } from "../../consts.js";
import { getQueuedTokensBeforeStopTrigger } from "../../utils/getQueuedTokensBeforeStopTrigger.js";
import { resolveChatWrapper } from "../../chatWrappers/utils/resolveChatWrapper.js";
import { GeneralChatWrapper } from "../../chatWrappers/GeneralChatWrapper.js";
import { safeEventCallback } from "../../utils/safeEventCallback.js";
import { pushAll } from "../../utils/pushAll.js";
import { resolveLastTokens } from "../../utils/resolveLastTokens.js";
import { eraseFirstResponseAndKeepFirstSystemChatContextShiftStrategy } from "./utils/contextShiftStrategies/eraseFirstResponseAndKeepFirstSystemChatContextShiftStrategy.js";
import { FunctionCallNameGrammar } from "./utils/FunctionCallNameGrammar.js";
import { FunctionCallParamsGrammar } from "./utils/FunctionCallParamsGrammar.js";
const defaultContextShiftOptions = {
    size: (sequence) => Math.max(1, Math.floor(sequence.context.contextSize / 10)),
    strategy: "eraseFirstResponseAndKeepFirstSystem",
    lastEvaluationMetadata: null
};
const defaultRepeatPenaltyLastTokens = 64;
const defaultTrimWhitespaceSuffix = false;
const defaultEvaluationPriority = 5;
export class LlamaChat {
    /** @internal */ _chatWrapper;
    /** @internal */ _disposeAggregator = new DisposeAggregator();
    /** @internal */ _autoDisposeSequence;
    /** @internal */ _chatLock = {};
    /** @internal */ _sequence;
    onDispose = new EventRelay();
    constructor({ contextSequence, chatWrapper = "auto", autoDisposeSequence = true }) {
        if (contextSequence == null)
            throw new Error("contextSequence cannot be null");
        if (contextSequence.disposed)
            throw new DisposedError();
        this._sequence = contextSequence;
        this._autoDisposeSequence = autoDisposeSequence;
        this._disposeAggregator.add(this._sequence.onDispose.createListener(() => {
            this.dispose();
        }));
        this._disposeAggregator.add(this.onDispose.dispatchEvent);
        this._chatWrapper = chatWrapper === "auto"
            ? (resolveChatWrapper({
                bosString: contextSequence.model.tokens.bosString,
                filename: contextSequence.model.filename,
                fileInfo: contextSequence.model.fileInfo,
                tokenizer: contextSequence.model.tokenizer
            }) ?? new GeneralChatWrapper())
            : chatWrapper;
    }
    dispose({ disposeSequence = this._autoDisposeSequence } = {}) {
        if (this._sequence == null)
            return;
        if (disposeSequence)
            this._sequence.dispose();
        this._sequence = null;
        this._disposeAggregator.dispose();
    }
    /** @hidden */
    [Symbol.dispose]() {
        return this.dispose();
    }
    get disposed() {
        return this._sequence == null;
    }
    get chatWrapper() {
        if (this._sequence == null)
            throw new DisposedError();
        return this._chatWrapper;
    }
    get sequence() {
        if (this._sequence == null)
            throw new DisposedError();
        return this._sequence;
    }
    get context() {
        return this.sequence.context;
    }
    get model() {
        return this.sequence.model;
    }
    async generateResponse(history, options = {}) {
        const { onTextChunk, onToken, signal, stopOnAbortSignal = false, maxTokens, temperature, minP, topK, topP, grammar, trimWhitespaceSuffix = defaultTrimWhitespaceSuffix, repeatPenalty = {}, tokenBias, evaluationPriority = defaultEvaluationPriority, functions, onFunctionCall, documentFunctionParams, maxParallelFunctionCalls, contextShift = defaultContextShiftOptions, customStopTriggers, lastEvaluationContextWindow: { history: lastEvaluationContextWindowHistory, minimumOverlapPercentageToPreventContextShift = 0.5 } = {} } = options;
        const generateResponseState = new GenerateResponseState(this, this._chatWrapper, history, {
            onTextChunk,
            onToken,
            signal,
            stopOnAbortSignal,
            maxTokens,
            temperature,
            minP,
            topK,
            topP,
            grammar: grammar, // this is a workaround to allow passing both `functions` and `grammar`
            trimWhitespaceSuffix,
            repeatPenalty,
            tokenBias,
            evaluationPriority,
            functions,
            onFunctionCall,
            documentFunctionParams,
            maxParallelFunctionCalls,
            contextShift,
            customStopTriggers,
            lastEvaluationContextWindow: {
                history: lastEvaluationContextWindowHistory,
                minimumOverlapPercentageToPreventContextShift
            }
        });
        if (generateResponseState.grammar != null && generateResponseState.functionsEnabled)
            throw new Error("Using both grammar and functions is not supported yet");
        return await withLock(this._chatLock, "evaluate", signal, async () => {
            try {
                generateResponseState.ensureLastHistoryItemIsModel();
                const loadContextWindow = async (avoidReloadingHistory = false) => {
                    await generateResponseState.loadContextWindow(generateResponseState.getResolvedHistoryWithCurrentModelResponse(), false, avoidReloadingHistory);
                };
                const loadContextWindowForFunctionCallingLoop = async () => loadContextWindow(true);
                // eslint-disable-next-line no-constant-condition
                while (true) {
                    generateResponseState.startTokenLoop();
                    generateResponseState.canAvoidReloadingHistory = false;
                    await loadContextWindow();
                    generateResponseState.addStopGenerationTriggersFromChatWrapper();
                    if (generateResponseState.generatedTokens === 0) {
                        generateResponseState.addIgnoreStartTextTriggersFromChatWrapper();
                        if (generateResponseState.functionsEnabled) {
                            generateResponseState.initFunctions();
                        }
                    }
                    if (generateResponseState.functionEvaluationMode !== false) {
                        const functionsCallsRes = await generateResponseState.enterFunctionCallingLoop(loadContextWindowForFunctionCallingLoop);
                        if (functionsCallsRes != null)
                            return functionsCallsRes;
                        await loadContextWindowForFunctionCallingLoop();
                    }
                    await generateResponseState.alignCurrentSequenceStateWithCurrentTokens();
                    await generateResponseState.createNewEvaluationIterator();
                    while (await generateResponseState.iterateEvaluation()) {
                        generateResponseState.waitOnPartialCharactersOrWhiteSpaceTokens();
                        generateResponseState.detectAndHandleFunctionStartSyntax();
                        if (generateResponseState.functionEvaluationMode !== false) {
                            generateResponseState.canAvoidReloadingHistory = false;
                            generateResponseState.releasePartiallyFreeTokensBeforeFunctionCallStart();
                            const functionsCallsRes = await generateResponseState.enterFunctionCallingLoop(loadContextWindowForFunctionCallingLoop);
                            if (functionsCallsRes != null)
                                return functionsCallsRes;
                        }
                        generateResponseState.recordStopGenerationEvaluation();
                        generateResponseState.popStreamRegulatorFreeTokens();
                        generateResponseState.removeFoundStartIgnoreTextsFromPendingTokens();
                        const stopGenerationTriggerRes = generateResponseState.handleStopGenerationTrigger("model");
                        if (stopGenerationTriggerRes != null)
                            return stopGenerationTriggerRes;
                        generateResponseState.spliceIgnoreStartTextDetectedTokens();
                        generateResponseState.moveFreePendingTokensToRes();
                        const maxTokensTriggerRes = generateResponseState.handleMaxTokensTrigger("model");
                        if (maxTokensTriggerRes != null)
                            return maxTokensTriggerRes;
                        if (generateResponseState.updateShouldContextShift())
                            break;
                        const abortRes = generateResponseState.handleAbortTrigger("model");
                        if (abortRes != null)
                            return abortRes;
                    }
                    generateResponseState.isFirstEvaluation = false;
                    if (generateResponseState.shouldContextShift)
                        continue;
                    break;
                }
                throw new Error("The context size is too small to generate a response");
            }
            finally {
                generateResponseState.dispose();
            }
        });
    }
    async loadChatAndCompleteUserMessage(history, options = {}) {
        const { initialUserPrompt = "", stopOnAbortSignal = false, onTextChunk, onToken, signal, maxTokens = Math.min(256, Math.ceil(this.context.contextSize / 2)), temperature, minP, topK, topP, grammar, trimWhitespaceSuffix = defaultTrimWhitespaceSuffix, repeatPenalty = {}, tokenBias, evaluationPriority = defaultEvaluationPriority, functions, documentFunctionParams, contextShift = defaultContextShiftOptions, customStopTriggers, lastEvaluationContextWindow: { history: lastEvaluationContextWindowHistory, minimumOverlapPercentageToPreventContextShift = 0.8 } = {} } = options;
        const lastEvaluationContextWindowHistoryItem = lastEvaluationContextWindowHistory == null
            ? null
            : lastEvaluationContextWindowHistory[lastEvaluationContextWindowHistory.length - 1];
        const lastEvaluationContextWindowUserMessage = lastEvaluationContextWindowHistoryItem?.type === "user"
            ? lastEvaluationContextWindowHistoryItem.text
            : "";
        const generateResponseState = new GenerateResponseState(this, this._chatWrapper, history, {
            onTextChunk,
            onToken,
            signal,
            stopOnAbortSignal,
            maxTokens,
            temperature,
            minP,
            topK,
            topP,
            grammar: grammar, // this is a workaround to allow passing both `functions` and `grammar`
            trimWhitespaceSuffix,
            repeatPenalty,
            tokenBias,
            evaluationPriority,
            functions,
            documentFunctionParams,
            contextShift,
            customStopTriggers,
            lastEvaluationContextWindow: {
                history: lastEvaluationContextWindowHistory == null
                    ? undefined
                    : setLastUserTextInChatHistory(lastEvaluationContextWindowHistory, lastEvaluationContextWindowUserMessage + initialUserPrompt),
                minimumOverlapPercentageToPreventContextShift
            }
        });
        return await withLock(this._chatLock, "evaluate", signal, async () => {
            try {
                generateResponseState.ensureLastHistoryItemIsUser();
                const lastResolvedHistoryItem = generateResponseState.resolvedHistory[generateResponseState.resolvedHistory.length - 1];
                const initialUserMessage = lastResolvedHistoryItem?.type === "user"
                    ? lastResolvedHistoryItem.text
                    : "";
                // eslint-disable-next-line no-constant-condition
                while (true) {
                    generateResponseState.startTokenLoop();
                    const { userTextSuffix } = await generateResponseState.loadContextWindow(setLastUserTextInChatHistory(generateResponseState.resolvedHistory, initialUserMessage + initialUserPrompt + this.model.detokenize(generateResponseState.res)), true);
                    generateResponseState.functionEvaluationMode = false;
                    generateResponseState.addStopGenerationTriggersFromChatWrapper();
                    if (userTextSuffix != null && userTextSuffix.values.length > 0)
                        generateResponseState.stopGenerationDetector.addStopTrigger(StopGenerationDetector.resolveLlamaTextTrigger(userTextSuffix, this.model.tokenizer));
                    await generateResponseState.alignCurrentSequenceStateWithCurrentTokens();
                    if (generateResponseState.maxTokens === 0) {
                        await generateResponseState.evaluateWithoutGeneratingNewTokens();
                        return {
                            completion: "",
                            lastEvaluation: {
                                contextWindow: setLastUserTextInChatHistory(generateResponseState.lastContextWindowHistory, initialUserMessage),
                                contextShiftMetadata: generateResponseState.lastHistoryCompressionMetadata
                            },
                            metadata: {
                                stopReason: "maxTokens"
                            }
                        };
                    }
                    await generateResponseState.createNewEvaluationIterator();
                    while (await generateResponseState.iterateEvaluation()) {
                        generateResponseState.waitOnPartialCharactersOrWhiteSpaceTokens();
                        generateResponseState.recordStopGenerationEvaluation();
                        generateResponseState.popStreamRegulatorFreeTokens();
                        const stopGenerationTriggerRes = generateResponseState.handleStopGenerationTrigger("user");
                        if (stopGenerationTriggerRes != null)
                            return {
                                completion: stopGenerationTriggerRes.response,
                                lastEvaluation: {
                                    contextWindow: setLastUserTextInChatHistory(generateResponseState.lastContextWindowHistory, initialUserMessage),
                                    contextShiftMetadata: stopGenerationTriggerRes.lastEvaluation.contextShiftMetadata
                                },
                                metadata: stopGenerationTriggerRes.metadata.stopReason === "customStopTrigger"
                                    ? stopGenerationTriggerRes.metadata
                                    : stopGenerationTriggerRes.metadata
                            };
                        generateResponseState.moveFreePendingTokensToRes(false);
                        const maxTokensTriggerRes = generateResponseState.handleMaxTokensTrigger("user");
                        if (maxTokensTriggerRes != null)
                            return {
                                completion: maxTokensTriggerRes.response,
                                lastEvaluation: {
                                    contextWindow: setLastUserTextInChatHistory(generateResponseState.lastContextWindowHistory, initialUserMessage),
                                    contextShiftMetadata: maxTokensTriggerRes.lastEvaluation.contextShiftMetadata
                                },
                                metadata: maxTokensTriggerRes.metadata
                            };
                        if (generateResponseState.updateShouldContextShift())
                            break;
                        const abortRes = generateResponseState.handleAbortTrigger("user");
                        if (abortRes != null)
                            return {
                                completion: abortRes.response,
                                lastEvaluation: {
                                    contextWindow: setLastUserTextInChatHistory(generateResponseState.lastContextWindowHistory, initialUserMessage),
                                    contextShiftMetadata: abortRes.lastEvaluation.contextShiftMetadata
                                },
                                metadata: abortRes.metadata
                            };
                    }
                    generateResponseState.isFirstEvaluation = false;
                    if (generateResponseState.shouldContextShift)
                        continue;
                    break;
                }
                throw new Error("The context size is too small to generate a completion");
            }
            finally {
                generateResponseState.dispose();
            }
        });
    }
}
function removeRawFromHistoryItem(historyItem) {
    if (historyItem.type === "model") {
        const newHistoryItem = { ...historyItem };
        newHistoryItem.response = newHistoryItem.response.map((item) => {
            if (typeof item === "string")
                return item;
            else
                return {
                    ...item,
                    rawCall: undefined
                };
        });
        return newHistoryItem;
    }
    return historyItem;
}
async function compressHistoryToFitContextSize({ history, contextShiftSize, contextShiftStrategy, contextShiftLastEvaluationMetadata, contextSize, tokenizer, chatWrapper, functions, documentFunctionParams }) {
    function checkIfHistoryFitsContext(history) {
        const { contextText } = chatWrapper.generateContextState({
            chatHistory: history,
            availableFunctions: functions,
            documentFunctionParams
        });
        const tokens = contextText.tokenize(tokenizer);
        return tokens.length <= contextSize - contextShiftSize;
    }
    if (contextSize - contextShiftSize <= 0)
        throw new Error(`The context size (${contextSize}) is too small to fit the context shift size (${contextShiftSize})`);
    if (checkIfHistoryFitsContext(history))
        return {
            compressedHistory: history,
            metadata: null
        };
    if (contextShiftStrategy instanceof Function) {
        try {
            const { chatHistory, metadata } = await contextShiftStrategy({
                chatHistory: history,
                maxTokensCount: contextSize - contextShiftSize,
                tokenizer,
                chatWrapper,
                lastShiftMetadata: contextShiftLastEvaluationMetadata
            });
            if (checkIfHistoryFitsContext(chatHistory))
                return {
                    compressedHistory: chatHistory,
                    metadata
                };
            console.warn("The provided context shift strategy did not return a history that fits the context size. " +
                "Using the default strategy instead.");
        }
        catch (err) {
            console.error("The provided context shift strategy threw an error. " +
                "Using the default strategy instead.", err);
        }
    }
    else if (contextShiftStrategy !== "eraseFirstResponseAndKeepFirstSystem")
        console.warn(`Unknown context shift strategy "${contextShiftStrategy}". ` +
            "Using the default strategy instead.");
    const { chatHistory, metadata } = await eraseFirstResponseAndKeepFirstSystemChatContextShiftStrategy({
        chatHistory: history,
        maxTokensCount: contextSize - contextShiftSize,
        tokenizer,
        chatWrapper,
        lastShiftMetadata: contextShiftLastEvaluationMetadata
    });
    if (!checkIfHistoryFitsContext(chatHistory))
        throw new Error("The default context shift strategy did not return a history that fits the context size. " +
            "This may happen due to the system prompt being too long");
    return {
        compressedHistory: chatHistory,
        metadata
    };
}
function getLastTextModelResponseFromChatHistory(chatHistory) {
    if (chatHistory.length === 0 || chatHistory[chatHistory.length - 1].type !== "model")
        return "";
    const lastModelResponseItem = chatHistory[chatHistory.length - 1];
    const modelResponse = lastModelResponseItem.response;
    if (modelResponse.length > 0 && typeof modelResponse[modelResponse.length - 1] === "string")
        return modelResponse[modelResponse.length - 1];
    return "";
}
function getLastUserTextFromChatHistory(chatHistory) {
    if (chatHistory.length === 0 || chatHistory[chatHistory.length - 1].type !== "user")
        return "";
    return chatHistory[chatHistory.length - 1].text;
}
function setLastModelTextResponseInChatHistory(chatHistory, textResponse) {
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
    if (modelResponse.length > 0 && typeof modelResponse[modelResponse.length - 1] === "string") {
        if (textResponse === "")
            modelResponse.pop();
        else
            modelResponse[modelResponse.length - 1] = textResponse;
    }
    else if (textResponse !== "")
        modelResponse.push(textResponse);
    return newChatHistory;
}
function setLastUserTextInChatHistory(chatHistory, userText) {
    const newChatHistory = chatHistory.slice();
    if (newChatHistory.length === 0 || newChatHistory[newChatHistory.length - 1].type !== "user")
        newChatHistory.push({
            type: "user",
            text: ""
        });
    const lastUserItem = newChatHistory[newChatHistory.length - 1];
    const newLastUserItem = { ...lastUserItem };
    newChatHistory[newChatHistory.length - 1] = newLastUserItem;
    newLastUserItem.text = userText;
    return newChatHistory;
}
function setLastTextInChatHistory(itemType, chatHistory, text) {
    if (itemType === "user")
        return setLastUserTextInChatHistory(chatHistory, text);
    else
        return setLastModelTextResponseInChatHistory(chatHistory, text);
}
function generateContextText(endWithUserText, chatWrapper, options) {
    if (endWithUserText)
        return generateContextTextThatEndsWithUserText(chatWrapper, options);
    return chatWrapper.generateContextState(options);
}
function generateContextTextThatEndsWithUserText(chatWrapper, options) {
    const lastUserText = getLastUserTextFromChatHistory(options.chatHistory);
    const randomId = "W" + (Math.random()
        .toString(36)
        .slice(2)) + "W";
    const { contextText, ...rest } = chatWrapper.generateContextState({
        ...options,
        chatHistory: setLastUserTextInChatHistory(options.chatHistory, lastUserText + randomId)
    });
    let newContextText = contextText;
    for (let i = 0; i < newContextText.values.length; i++) {
        const item = newContextText.values[i];
        if (typeof item !== "string")
            continue;
        const randomTextIndex = item.indexOf(randomId);
        if (randomTextIndex < 0)
            continue;
        const newValue = item.slice(0, randomTextIndex);
        newContextText = LlamaText([
            ...newContextText.values.slice(0, i),
            newValue
        ]);
        return {
            contextText: newContextText,
            userTextSuffix: LlamaText([
                item.slice(randomTextIndex + randomId.length),
                ...newContextText.values.slice(i + 1)
            ]),
            ...rest
        };
    }
    throw new Error("The random ID was not found in the context text. " +
        `There might be an issue with the chat wrapper "${chatWrapper.wrapperName}" ` +
        "where not all user messages are properly added to the the result LlamaText");
}
async function getContextWindow({ resolvedHistory, resolvedContextShift, lastHistoryCompressionMetadata, pendingTokensCount = 0, isFirstEvaluation, chatWrapper, lastEvaluationContextWindowHistory, minimumOverlapPercentageToPreventContextShift, sequence, minFreeContextTokens = 1, functions, documentFunctionParams, endWithUserText }) {
    if (sequence == null)
        throw new DisposedError();
    const model = sequence.model;
    const context = sequence.context;
    if (isFirstEvaluation && lastEvaluationContextWindowHistory != null && sequence.isLoadedToMemory) {
        const newContextWindow = lastEvaluationContextWindowHistory.slice();
        if (endWithUserText) {
            if (newContextWindow.length === 0 || newContextWindow[newContextWindow.length - 1].type !== "user")
                newContextWindow.push({
                    type: "user",
                    text: ""
                });
        }
        else if (newContextWindow.length === 0 || newContextWindow[newContextWindow.length - 1].type !== "model")
            newContextWindow.push({
                type: "model",
                response: []
            });
        const { contextText, stopGenerationTriggers, ignoreStartText, functionCall, userTextSuffix } = generateContextText(endWithUserText, chatWrapper, {
            chatHistory: newContextWindow,
            availableFunctions: functions,
            documentFunctionParams
        });
        const tokens = contextText.tokenize(model.tokenizer);
        if (tokens.length + pendingTokensCount + minFreeContextTokens < context.contextSize) {
            const { firstDifferentIndex } = sequence.compareContextTokens(tokens);
            const existingEvaluationPercentage = firstDifferentIndex / tokens.length;
            if (existingEvaluationPercentage >= minimumOverlapPercentageToPreventContextShift)
                return {
                    history: newContextWindow,
                    stopGenerationTriggers,
                    tokens,
                    newResolvedHistory: resolvedHistory,
                    newHistoryCompressionMetadata: lastHistoryCompressionMetadata,
                    ignoreStartText: ignoreStartText ?? [],
                    functionCallInitiallyEngaged: functionCall?.initiallyEngaged ?? false,
                    disengageInitiallyEngagedFunctionCall: functionCall?.disengageInitiallyEngaged ?? [],
                    userTextSuffix
                };
        }
    }
    resolvedHistory = sequence.isLoadedToMemory
        ? resolvedHistory.slice()
        : resolvedHistory.map(removeRawFromHistoryItem);
    if (resolvedContextShift.lastEvaluationMetadata != null) {
        const contextShiftSize = resolvedContextShift.size instanceof Function
            ? await resolvedContextShift.size(sequence)
            : resolvedContextShift.size;
        const { compressedHistory, metadata } = await compressHistoryToFitContextSize({
            history: resolvedHistory,
            contextShiftSize: Math.max(minFreeContextTokens, Math.min(contextShiftSize, context.contextSize - pendingTokensCount)) + pendingTokensCount,
            contextShiftStrategy: resolvedContextShift.strategy,
            contextShiftLastEvaluationMetadata: resolvedContextShift.lastEvaluationMetadata,
            contextSize: context.contextSize,
            tokenizer: model.tokenizer,
            chatWrapper: chatWrapper,
            functions,
            documentFunctionParams
        });
        const { contextText, stopGenerationTriggers, ignoreStartText, functionCall, userTextSuffix } = generateContextText(endWithUserText, chatWrapper, {
            chatHistory: compressedHistory,
            availableFunctions: functions,
            documentFunctionParams
        });
        return {
            history: compressedHistory,
            stopGenerationTriggers,
            tokens: contextText.tokenize(model.tokenizer),
            newResolvedHistory: resolvedHistory,
            newHistoryCompressionMetadata: metadata,
            ignoreStartText: ignoreStartText ?? [],
            functionCallInitiallyEngaged: functionCall?.initiallyEngaged ?? false,
            disengageInitiallyEngagedFunctionCall: functionCall?.disengageInitiallyEngaged ?? [],
            userTextSuffix
        };
    }
    {
        const { contextText, stopGenerationTriggers, ignoreStartText, functionCall, userTextSuffix } = generateContextText(endWithUserText, chatWrapper, {
            chatHistory: resolvedHistory,
            availableFunctions: functions,
            documentFunctionParams
        });
        const tokens = contextText.tokenize(model.tokenizer);
        if (tokens.length + pendingTokensCount + minFreeContextTokens < context.contextSize)
            return {
                history: resolvedHistory,
                stopGenerationTriggers,
                tokens,
                newResolvedHistory: resolvedHistory,
                newHistoryCompressionMetadata: lastHistoryCompressionMetadata,
                ignoreStartText: ignoreStartText ?? [],
                functionCallInitiallyEngaged: functionCall?.initiallyEngaged ?? false,
                disengageInitiallyEngagedFunctionCall: functionCall?.disengageInitiallyEngaged ?? [],
                userTextSuffix
            };
    }
    const contextShiftSize = Math.min(context.contextSize, Math.max(1, Math.floor(resolvedContextShift.size instanceof Function
        ? await resolvedContextShift.size(sequence)
        : resolvedContextShift.size)));
    const { compressedHistory, metadata } = await compressHistoryToFitContextSize({
        history: resolvedHistory,
        contextShiftSize: Math.max(minFreeContextTokens, Math.min(contextShiftSize, context.contextSize - pendingTokensCount)) + pendingTokensCount,
        contextShiftStrategy: resolvedContextShift.strategy,
        contextShiftLastEvaluationMetadata: resolvedContextShift.lastEvaluationMetadata,
        contextSize: context.contextSize,
        tokenizer: model.tokenizer,
        chatWrapper: chatWrapper,
        functions,
        documentFunctionParams
    });
    const { contextText, stopGenerationTriggers, ignoreStartText, functionCall, userTextSuffix } = generateContextText(endWithUserText, chatWrapper, {
        chatHistory: compressedHistory,
        availableFunctions: functions,
        documentFunctionParams
    });
    return {
        history: compressedHistory,
        stopGenerationTriggers,
        tokens: contextText.tokenize(model.tokenizer),
        newResolvedHistory: resolvedHistory,
        newHistoryCompressionMetadata: metadata,
        ignoreStartText: ignoreStartText ?? [],
        functionCallInitiallyEngaged: functionCall?.initiallyEngaged ?? false,
        disengageInitiallyEngagedFunctionCall: functionCall?.disengageInitiallyEngaged ?? [],
        userTextSuffix
    };
}
class GenerateResponseState {
    llamaChat;
    chatWrapper;
    history;
    onTextChunk;
    onToken;
    signal;
    stopOnAbortSignal;
    maxTokens;
    temperature;
    minP;
    topK;
    topP;
    grammar;
    trimWhitespaceSuffix;
    tokenBias;
    evaluationPriority;
    functions;
    onFunctionCall;
    documentFunctionParams;
    maxParallelFunctionCalls;
    contextShift;
    customStopTriggers;
    lastEvaluationContextWindowHistory;
    minimumOverlapPercentageToPreventContextShift;
    functionsEnabled;
    repeatPenaltyEnabled;
    resolvedContextShift;
    resolvedRepeatPenalty;
    lastModelResponse;
    grammarEvaluationState;
    functionNameGrammar;
    functionsGrammar;
    functionsEvaluationState;
    streamRegulator = new TokenStreamRegulator();
    stopGenerationDetector = new StopGenerationDetector();
    customStopGenerationTriggersDetector = new StopGenerationDetector();
    functionSyntaxStartDetector = new StopGenerationDetector();
    disengageInitiallyEngagedFunctionMode = new StopGenerationDetector();
    ignoreStartTextDetector = new StopGenerationDetector();
    locksToReleaseOnValidGeneration = [];
    resolvedHistory;
    res = [];
    pendingTokens = [];
    ignoredStartTextTokens = [];
    resFunctionCalls = [];
    functionEvaluationMode = false;
    currentFunctionCallPreviousText = LlamaText([]);
    currentFunctionCallCurrentPartTokens = [];
    functionEvaluationFunctionName = "";
    currentFunctionCallPreviousPartLeftoverText = "";
    removedStartTextToIgnore = false;
    releasedPartiallyFreeTokensBeforeFunctionCallStartSyntax = false;
    generatedTokens = 0;
    isFirstEvaluation = true;
    initiallyEngagedFunctionMode = false;
    lastContextWindowHistory;
    lastHistoryCompressionMetadata;
    restartEvaluationIterator = false;
    // context shift loop
    shouldContextShift = false;
    canAvoidReloadingHistory = false;
    contextWindowTokens = [];
    stopGenerationTriggers = [];
    ignoreStartText = [];
    functionCallInitiallyEngaged = false;
    disengageInitiallyEngagedFunctionCall = [];
    userTextSuffix = undefined;
    tokens = [];
    contextWindowLastModelResponse = "";
    contextWindowsRes = [];
    // token evaluation loop
    evaluationIterator;
    currentIteration;
    currentIterationReplacementToken;
    currentToken;
    currentTokens = [];
    currentText = "";
    currentQueuedTokenRelease;
    constructor(llamaChat, chatWrapper, history, { onTextChunk, onToken, signal, stopOnAbortSignal = false, maxTokens, temperature, minP, topK, topP, grammar, trimWhitespaceSuffix = defaultTrimWhitespaceSuffix, repeatPenalty = {}, tokenBias, evaluationPriority = defaultEvaluationPriority, functions, onFunctionCall, documentFunctionParams, maxParallelFunctionCalls, contextShift = defaultContextShiftOptions, customStopTriggers, lastEvaluationContextWindow: { history: lastEvaluationContextWindowHistory, minimumOverlapPercentageToPreventContextShift = 0.5 } = {} } = {}) {
        this.llamaChat = llamaChat;
        this.chatWrapper = chatWrapper;
        this.history = history;
        this.onTextChunk = safeEventCallback(onTextChunk);
        this.onToken = safeEventCallback(onToken);
        this.signal = signal;
        this.stopOnAbortSignal = stopOnAbortSignal;
        this.maxTokens = maxTokens;
        this.temperature = temperature;
        this.minP = minP;
        this.topK = topK;
        this.topP = topP;
        this.grammar = grammar;
        this.trimWhitespaceSuffix = trimWhitespaceSuffix;
        this.tokenBias = tokenBias;
        this.evaluationPriority = evaluationPriority;
        this.functions = functions;
        this.onFunctionCall = safeEventCallback(onFunctionCall);
        this.documentFunctionParams = documentFunctionParams;
        this.maxParallelFunctionCalls = maxParallelFunctionCalls;
        this.contextShift = contextShift;
        this.customStopTriggers = customStopTriggers;
        this.lastEvaluationContextWindowHistory = lastEvaluationContextWindowHistory;
        this.minimumOverlapPercentageToPreventContextShift = minimumOverlapPercentageToPreventContextShift;
        this.functionsEnabled = (this.functions != null && Object.keys(this.functions).length > 0);
        if (this.signal?.aborted)
            throw this.signal.reason;
        if (this.llamaChat.disposed)
            throw new DisposedError();
        this.resolvedHistory = this.llamaChat.sequence.isLoadedToMemory
            ? this.history.slice()
            : this.history.map(removeRawFromHistoryItem);
        this.resolvedContextShift = {
            ...defaultContextShiftOptions,
            ...removeNullFields(this.contextShift)
        };
        this.resolvedRepeatPenalty = repeatPenalty === false
            ? { lastTokens: 0 }
            : {
                ...(repeatPenalty ?? {}),
                lastTokens: repeatPenalty?.lastTokens ?? defaultRepeatPenaltyLastTokens
            };
        this.lastModelResponse = getLastTextModelResponseFromChatHistory(this.resolvedHistory);
        this.repeatPenaltyEnabled = this.resolvedRepeatPenalty.lastTokens > 0;
        this.grammarEvaluationState = this.grammar != null
            ? new LlamaGrammarEvaluationState({ grammar: this.grammar })
            : undefined;
        this.functionNameGrammar = this.functionsEnabled
            ? new FunctionCallNameGrammar(this.llamaChat.model._llama, this.functions, this.chatWrapper)
            : undefined;
        this.functionsGrammar = undefined;
        this.functionsEvaluationState = undefined;
        this.lastContextWindowHistory = this.resolvedHistory;
        this.lastHistoryCompressionMetadata = this.resolvedContextShift;
        if (this.customStopTriggers != null)
            StopGenerationDetector.resolveStopTriggers(this.customStopTriggers, this.llamaChat.model.tokenizer)
                .map((stopTrigger) => this.customStopGenerationTriggersDetector.addStopTrigger(stopTrigger));
        if (this.grammar != null)
            StopGenerationDetector.resolveStopTriggers(this.grammar.stopGenerationTriggers, this.llamaChat.model.tokenizer)
                .map((stopTrigger) => this.stopGenerationDetector.addStopTrigger(stopTrigger));
        if (this.functions != null && Object.keys(this.functions).length > 0)
            this.functionSyntaxStartDetector.addStopTrigger(StopGenerationDetector.resolveLlamaTextTrigger(LlamaText([
                this.chatWrapper.settings.functions?.parallelism?.call?.sectionPrefix ?? "",
                this.chatWrapper.settings.functions.call.prefix
            ]), this.llamaChat.model.tokenizer));
        this.getPenaltyTokens = this.getPenaltyTokens.bind(this);
    }
    dispose() {
    }
    [Symbol.dispose]() {
        this.dispose();
    }
    ensureLastHistoryItemIsModel() {
        if (this.resolvedHistory.length === 0 || this.resolvedHistory[this.resolvedHistory.length - 1].type !== "model")
            this.resolvedHistory.push({
                type: "model",
                response: []
            });
    }
    ensureLastHistoryItemIsUser() {
        if (this.resolvedHistory.length === 0 || this.resolvedHistory[this.resolvedHistory.length - 1].type !== "user")
            this.resolvedHistory.push({
                type: "user",
                text: ""
            });
    }
    ensureNotAborted() {
        if (this.signal?.aborted && (!this.stopOnAbortSignal || this.res.length === 0))
            throw this.signal.reason;
        if (this.llamaChat.disposed)
            throw new DisposedError();
    }
    getPenaltyTokens() {
        if (this.llamaChat.disposed)
            throw new DisposedError();
        let punishTokens = this.res.slice(-this.resolvedRepeatPenalty.lastTokens);
        if (this.resolvedRepeatPenalty.punishTokensFilter != null)
            punishTokens = this.resolvedRepeatPenalty.punishTokensFilter(punishTokens);
        if (this.resolvedRepeatPenalty.penalizeNewLine == null || !this.resolvedRepeatPenalty.penalizeNewLine) {
            const nlToken = this.llamaChat.model.tokens.nl;
            if (nlToken != null)
                punishTokens = punishTokens.filter(token => token !== nlToken);
        }
        return punishTokens;
    }
    getResolvedHistoryWithCurrentModelResponse() {
        if (this.res.length === 0)
            return this.resolvedHistory;
        let modelResponse = this.llamaChat.model.detokenize(this.res);
        if (this.grammar?.trimWhitespaceSuffix || this.trimWhitespaceSuffix)
            modelResponse = modelResponse.trimEnd();
        if (modelResponse === "")
            return this.resolvedHistory;
        return setLastModelTextResponseInChatHistory(this.resolvedHistory, this.lastModelResponse + modelResponse);
    }
    removeFoundStartIgnoreTextsFromPendingTokens(forceRemove = false) {
        if (!this.removedStartTextToIgnore && this.res.length === 0 && this.pendingTokens.length > 0 &&
            this.ignoreStartTextDetector.hasTriggeredStops && (forceRemove || !this.ignoreStartTextDetector.hasInProgressStops)) {
            this.ignoreStartTextDetector.clearInProgressStops();
            this.ignoreStartTextDetector.clearTriggeredStops();
            let mostExhaustiveTriggeredStops = null;
            let mostExhaustiveTriggeredStopsLeftoverTokens = [];
            const lastTokensForDetokenizer = resolveLastTokens([
                this.contextWindowTokens,
                this.ignoredStartTextTokens
            ]);
            for (let i = 0; i < this.pendingTokens.length; i++) {
                this.ignoreStartTextDetector.recordGeneration({
                    text: this.llamaChat.model.detokenize([this.pendingTokens[i]], false, lastTokensForDetokenizer),
                    tokens: [this.pendingTokens[i]],
                    startNewChecks: i === 0,
                    triggerMustStartWithGeneration: true
                });
                lastTokensForDetokenizer.push(this.pendingTokens[i]);
                if (this.ignoreStartTextDetector.hasTriggeredStops) {
                    mostExhaustiveTriggeredStops = this.ignoreStartTextDetector.getTriggeredStops();
                    this.ignoreStartTextDetector.clearTriggeredStops();
                    mostExhaustiveTriggeredStopsLeftoverTokens = this.pendingTokens.slice(i + 1);
                }
                else if (!this.ignoreStartTextDetector.hasInProgressStops)
                    break;
            }
            if (mostExhaustiveTriggeredStops != null) {
                const [mostExhaustiveTriggeredStop] = mostExhaustiveTriggeredStops;
                if (mostExhaustiveTriggeredStop != null) {
                    this.ignoredStartTextTokens = mostExhaustiveTriggeredStop.stopTrigger
                        .map((stopTrigger) => {
                        if (typeof stopTrigger === "string")
                            return this.llamaChat.model.tokenize(stopTrigger, false, "trimLeadingSpace");
                        else
                            return [stopTrigger];
                    })
                        .flat(1);
                    const newPendingTokens = [
                        ...mostExhaustiveTriggeredStop.remainingGeneration,
                        mostExhaustiveTriggeredStopsLeftoverTokens
                    ]
                        .map((generation) => {
                        if (typeof generation === "string")
                            return this.llamaChat.model.tokenize(generation, false, "trimLeadingSpace");
                        else
                            return generation;
                    })
                        .flat(1);
                    this.pendingTokens.length = 0;
                    pushAll(this.pendingTokens, newPendingTokens);
                    this.removedStartTextToIgnore = true;
                }
            }
        }
    }
    startTokenLoop() {
        this.ensureNotAborted();
        this.shouldContextShift = false;
    }
    getContextWindowFunctionCallsTokens() {
        if (this.functionEvaluationMode === false)
            return [];
        else if (this.functionEvaluationMode === "prefixOrDisengage")
            return [
                ...LlamaText(this.currentFunctionCallPreviousText).tokenize(this.llamaChat.model.tokenizer, "trimLeadingSpace"),
                ...this.currentFunctionCallCurrentPartTokens
            ];
        const text = [];
        if (this.chatWrapper.settings.functions?.parallelism?.call?.sectionPrefix != null)
            text.push(this.chatWrapper.settings.functions.parallelism.call.sectionPrefix);
        for (let i = 0; i < this.resFunctionCalls.length; i++) {
            const call = this.resFunctionCalls[i];
            if (i > 0)
                text.push(this.chatWrapper.settings.functions?.parallelism?.call?.betweenCalls ?? "");
            text.push(call.raw);
        }
        text.push(this.currentFunctionCallPreviousText);
        return [
            ...LlamaText(text).tokenize(this.llamaChat.model.tokenizer, "trimLeadingSpace"),
            ...this.currentFunctionCallCurrentPartTokens
        ];
    }
    async loadContextWindow(resolvedHistory, endWithUserText = false, avoidReloadingHistory = false) {
        const queuedChunkTokens = this.streamRegulator.getAllQueuedChunkTokens();
        const functionCallsTokens = this.getContextWindowFunctionCallsTokens();
        if (!avoidReloadingHistory || !this.canAvoidReloadingHistory || !this.llamaChat.sequence.isLoadedToMemory) {
            const { history: contextWindowHistory, stopGenerationTriggers, tokens: contextWindowTokens, newResolvedHistory, newHistoryCompressionMetadata, ignoreStartText, functionCallInitiallyEngaged, disengageInitiallyEngagedFunctionCall, userTextSuffix } = await getContextWindow({
                resolvedHistory: resolvedHistory,
                resolvedContextShift: this.resolvedContextShift,
                lastHistoryCompressionMetadata: this.lastHistoryCompressionMetadata,
                pendingTokensCount: this.pendingTokens.length + queuedChunkTokens.length + functionCallsTokens.length,
                isFirstEvaluation: this.isFirstEvaluation,
                chatWrapper: this.chatWrapper,
                lastEvaluationContextWindowHistory: this.lastEvaluationContextWindowHistory,
                minimumOverlapPercentageToPreventContextShift: this.minimumOverlapPercentageToPreventContextShift,
                sequence: this.llamaChat.sequence,
                minFreeContextTokens: 1,
                functions: this.functionsEnabled ? this.functions : undefined,
                documentFunctionParams: this.documentFunctionParams,
                endWithUserText
            });
            this.ensureNotAborted();
            this.contextWindowTokens = contextWindowTokens;
            this.stopGenerationTriggers = stopGenerationTriggers;
            this.ignoreStartText = ignoreStartText;
            this.functionCallInitiallyEngaged = functionCallInitiallyEngaged;
            this.disengageInitiallyEngagedFunctionCall = disengageInitiallyEngagedFunctionCall;
            this.userTextSuffix = userTextSuffix;
            this.resolvedHistory = newResolvedHistory;
            this.lastHistoryCompressionMetadata = newHistoryCompressionMetadata;
            this.lastContextWindowHistory = contextWindowHistory;
            this.contextWindowLastModelResponse = getLastTextModelResponseFromChatHistory(contextWindowHistory);
            this.contextWindowsRes = [];
            this.canAvoidReloadingHistory = true;
        }
        this.tokens = [
            ...this.contextWindowTokens,
            ...this.ignoredStartTextTokens,
            ...this.pendingTokens,
            ...queuedChunkTokens,
            ...functionCallsTokens
        ];
        if (avoidReloadingHistory && this.tokens.length >= this.llamaChat.sequence.context.contextSize - 1)
            return await this.loadContextWindow(resolvedHistory, endWithUserText, false);
        return {
            userTextSuffix: this.userTextSuffix
        };
    }
    addIgnoreStartTextTriggersFromChatWrapper() {
        StopGenerationDetector.resolveStopTriggers(this.ignoreStartText, this.llamaChat.model.tokenizer)
            .map((stopTrigger) => this.ignoreStartTextDetector.addStopTrigger(stopTrigger));
    }
    addStopGenerationTriggersFromChatWrapper() {
        StopGenerationDetector.resolveStopTriggers(this.stopGenerationTriggers, this.llamaChat.model.tokenizer)
            .map((stopTrigger) => this.stopGenerationDetector.addStopTrigger(stopTrigger));
    }
    initFunctions() {
        this.initiallyEngagedFunctionMode = this.functionCallInitiallyEngaged;
        if (this.initiallyEngagedFunctionMode) {
            StopGenerationDetector.resolveStopTriggers(this.disengageInitiallyEngagedFunctionCall, this.llamaChat.model.tokenizer)
                .map((stopTrigger) => this.disengageInitiallyEngagedFunctionMode.addStopTrigger(stopTrigger));
            if (this.disengageInitiallyEngagedFunctionMode.hasTriggers) {
                this.functionEvaluationMode = "prefixOrDisengage";
                this.functionsGrammar = undefined;
                this.functionsEvaluationState = undefined;
            }
            else {
                this.functionEvaluationMode = "functionName";
            }
            this.restartEvaluationIterator = true;
        }
    }
    async enterFunctionCallingLoop(loadContextWindow) {
        if (!this.functionsEnabled) {
            this.functionEvaluationMode = false;
            return undefined;
        }
        // eslint-disable-next-line no-constant-condition
        while (true) {
            if (this.functionEvaluationMode === "prefixOrDisengage") {
                this.functionsGrammar = undefined;
                this.functionsEvaluationState = undefined;
                this.currentFunctionCallPreviousText = LlamaText([]);
                this.currentFunctionCallCurrentPartTokens.length = 0;
                const prefixTokens = LlamaText(this.chatWrapper.settings.functions.call.prefix)
                    .tokenize(this.llamaChat.model.tokenizer, "trimLeadingSpace");
                const prefixDetector = new StopGenerationDetector();
                const prefixDetectorRecordedTokens = [];
                const afterPrefixLeftoverTokens = [];
                prefixDetector.addStopTrigger(StopGenerationDetector.resolveLlamaTextTrigger(LlamaText(this.chatWrapper.settings.functions.call.prefix), this.llamaChat.model.tokenizer));
                const lastTokensForDetokenizer = this.streamRegulator.getLastQueuedChunkTokens();
                for (const prefixToken of prefixTokens) {
                    const tokens = [prefixToken];
                    const text = this.llamaChat.model.detokenize(tokens, false, lastTokensForDetokenizer);
                    pushAll(lastTokensForDetokenizer, tokens);
                    const disregardedPossibilities = this.disengageInitiallyEngagedFunctionMode
                        .getDisregardedPossibilitiesCountForAGeneration({
                        text,
                        tokens,
                        startNewChecks: this.currentFunctionCallCurrentPartTokens.length === 0
                    });
                    if (disregardedPossibilities > 0)
                        break;
                    this.currentFunctionCallCurrentPartTokens.push(prefixToken);
                    this.disengageInitiallyEngagedFunctionMode.recordGeneration({
                        text: text,
                        tokens: tokens,
                        startNewChecks: this.currentFunctionCallCurrentPartTokens.length === 1,
                        triggerMustStartWithGeneration: true
                    });
                    if (prefixDetector.hasTriggeredStops)
                        afterPrefixLeftoverTokens.push(prefixToken);
                    else {
                        prefixDetector.recordGeneration({
                            text: text,
                            tokens: tokens,
                            startNewChecks: this.currentFunctionCallCurrentPartTokens.length === 1,
                            triggerMustStartWithGeneration: true
                        });
                        pushAll(prefixDetectorRecordedTokens, tokens);
                    }
                }
                for await (const token of this.evaluateWithContextShift(loadContextWindow)) {
                    const stopGenerationTriggerRes = this.handleStopGenerationTrigger("model");
                    if (stopGenerationTriggerRes != null)
                        return stopGenerationTriggerRes;
                    this.currentFunctionCallCurrentPartTokens.push(token);
                    this.disengageInitiallyEngagedFunctionMode.recordGeneration({
                        text: this.currentText,
                        tokens: this.currentTokens,
                        startNewChecks: this.currentFunctionCallCurrentPartTokens.length === 1,
                        triggerMustStartWithGeneration: true
                    });
                    if (prefixDetector.hasTriggeredStops)
                        afterPrefixLeftoverTokens.push(token);
                    else {
                        prefixDetector.recordGeneration({
                            text: this.currentText,
                            tokens: this.currentTokens,
                            startNewChecks: this.currentFunctionCallCurrentPartTokens.length === 1,
                            triggerMustStartWithGeneration: true
                        });
                        pushAll(prefixDetectorRecordedTokens, this.currentTokens);
                    }
                    if (this.disengageInitiallyEngagedFunctionMode.hasTriggeredStops ||
                        !this.disengageInitiallyEngagedFunctionMode.hasInProgressStops)
                        break;
                }
                const abortRes = this.handleAbortTrigger("model");
                if (abortRes != null)
                    return abortRes;
                if (this.disengageInitiallyEngagedFunctionMode.hasTriggeredStops) {
                    const lastTokensForDetokenizer = this.streamRegulator.getLastQueuedChunkTokens();
                    for (const token of this.currentFunctionCallCurrentPartTokens) {
                        this.currentToken = token;
                        this.currentTokens = [this.currentToken];
                        this.currentText = this.llamaChat.model.detokenize(this.currentTokens, false, lastTokensForDetokenizer);
                        pushAll(lastTokensForDetokenizer, this.currentTokens);
                        this.currentQueuedTokenRelease = this.streamRegulator.addChunk({
                            tokens: this.currentTokens,
                            text: this.currentText
                        });
                        this.recordStopGenerationEvaluation();
                    }
                    this.currentFunctionCallCurrentPartTokens.length = 0;
                    this.functionEvaluationMode = false;
                    return undefined;
                }
                if (prefixDetector.hasTriggeredStops) {
                    const triggeredStops = prefixDetector.getTriggeredStops();
                    const { firstRemainingGenerationAfterStop, stopTrigger } = StopGenerationDetector.getFirstRemainingGenerationAfterStop(triggeredStops);
                    this.currentFunctionCallPreviousPartLeftoverText = StopGenerationDetector.detokenizeRemainingGeneration(firstRemainingGenerationAfterStop, stopTrigger, this.llamaChat.model.tokenizer) + this.llamaChat.model.detokenize(afterPrefixLeftoverTokens, false, prefixDetectorRecordedTokens);
                }
                else
                    this.currentFunctionCallPreviousPartLeftoverText = "";
                this.functionEvaluationMode = "functionName";
                this.currentFunctionCallCurrentPartTokens.length = 0;
                continue;
            }
            else if (this.functionEvaluationMode === "functionName") {
                const functionNameGenerationDoneDetector = new StopGenerationDetector();
                this.stopGenerationDetector.clearInProgressStops();
                this.customStopGenerationTriggersDetector.clearInProgressStops();
                this.currentFunctionCallPreviousText = LlamaText(this.chatWrapper.settings.functions.call.prefix);
                this.currentFunctionCallCurrentPartTokens.length = 0;
                const functionNameGrammar = this.functionNameGrammar ?? new FunctionCallNameGrammar(this.llamaChat.model._llama, this.functions, this.chatWrapper);
                this.functionsGrammar = functionNameGrammar;
                this.functionsEvaluationState = new LlamaGrammarEvaluationState({
                    grammar: this.functionsGrammar
                });
                StopGenerationDetector.resolveStopTriggers(this.functionsGrammar.stopGenerationTriggers, this.llamaChat.model.tokenizer)
                    .map((stopTrigger) => functionNameGenerationDoneDetector.addStopTrigger(stopTrigger));
                if (this.currentFunctionCallPreviousPartLeftoverText !== "") {
                    const validFunctionNames = Object.keys(this.functions);
                    const hasAnyFunctionStartWithLeftover = validFunctionNames.some((functionName) => functionName.startsWith(this.currentFunctionCallPreviousPartLeftoverText));
                    if (hasAnyFunctionStartWithLeftover) {
                        const leftoverTokens = this.llamaChat.model.tokenize(this.currentFunctionCallPreviousPartLeftoverText, false, "trimLeadingSpace");
                        this.currentFunctionCallPreviousPartLeftoverText = "";
                        const lastTokens = [];
                        for (const leftoverToken of leftoverTokens) {
                            const canBeNextToken = this.llamaChat.context._canBeNextTokenForGrammarEvaluationState(this.functionsEvaluationState, leftoverToken);
                            if (!canBeNextToken)
                                break;
                            this.llamaChat.context._acceptTokenOnGrammarEvaluationState(this.functionsEvaluationState, leftoverToken);
                            this.currentFunctionCallCurrentPartTokens.push(leftoverToken);
                            functionNameGenerationDoneDetector.recordGeneration({
                                text: this.llamaChat.model.detokenize([leftoverToken], false, lastTokens),
                                tokens: [leftoverToken]
                            });
                            lastTokens.push(leftoverToken);
                        }
                    }
                }
                for await (const token of this.evaluateWithContextShift(loadContextWindow)) {
                    this.currentFunctionCallCurrentPartTokens.push(token);
                    functionNameGenerationDoneDetector.recordGeneration({
                        text: this.currentText,
                        tokens: this.currentTokens
                    });
                    if (functionNameGenerationDoneDetector.hasTriggeredStops)
                        break;
                }
                const abortRes = this.handleAbortTrigger("model");
                if (abortRes != null)
                    return abortRes;
                const functionCallNameText = this.llamaChat.model.detokenize(this.currentFunctionCallCurrentPartTokens);
                const functionName = functionNameGrammar.parseFunctionName(functionCallNameText);
                this.functionEvaluationFunctionName = functionName;
                this.functionEvaluationMode = "params";
                continue;
            }
            else if (this.functionEvaluationMode === "params") {
                this.currentFunctionCallPreviousText = LlamaText([
                    this.chatWrapper.settings.functions.call.prefix,
                    this.functionEvaluationFunctionName,
                    this.chatWrapper.settings.functions.call.paramsPrefix
                ]);
                const lastPartTokens = resolveLastTokens([this.currentFunctionCallCurrentPartTokens]);
                this.currentFunctionCallCurrentPartTokens.length = 0;
                let params = undefined;
                let paramsText = "";
                const functionDefinition = this.functions[this.functionEvaluationFunctionName];
                if (functionDefinition == null)
                    throw new Error(`Function "${this.functionEvaluationFunctionName}" is not provided in the functions object`);
                else if (functionDefinition.params == null) {
                    params = undefined;
                    paramsText = "";
                }
                else {
                    const functionParamsGenerationDoneDetector = new StopGenerationDetector();
                    const functionParamsGrammar = new FunctionCallParamsGrammar(this.llamaChat.model._llama, this.functions, this.chatWrapper, this.functionEvaluationFunctionName, functionDefinition.params);
                    this.functionsGrammar = functionParamsGrammar;
                    this.functionsEvaluationState = new LlamaGrammarEvaluationState({
                        grammar: this.functionsGrammar
                    });
                    StopGenerationDetector.resolveStopTriggers(this.functionsGrammar.stopGenerationTriggers, this.llamaChat.model.tokenizer)
                        .map((stopTrigger) => functionParamsGenerationDoneDetector.addStopTrigger(stopTrigger));
                    for await (const token of this.evaluateWithContextShift(loadContextWindow)) {
                        this.currentFunctionCallCurrentPartTokens.push(token);
                        functionParamsGenerationDoneDetector.recordGeneration({
                            text: this.currentText,
                            tokens: this.currentTokens
                        });
                        if (functionParamsGenerationDoneDetector.hasTriggeredStops)
                            break;
                    }
                    const abortRes = this.handleAbortTrigger("model");
                    if (abortRes != null)
                        return abortRes;
                    const functionCallParamsText = this.llamaChat.model.detokenize(this.currentFunctionCallCurrentPartTokens, false, lastPartTokens);
                    const parsedFunctionParams = functionParamsGrammar.parseParams(functionCallParamsText);
                    params = parsedFunctionParams.params;
                    paramsText = parsedFunctionParams.raw;
                }
                const functionCallText = LlamaText([
                    this.chatWrapper.settings.functions.call.prefix,
                    this.functionEvaluationFunctionName,
                    this.chatWrapper.settings.functions.call.paramsPrefix,
                    paramsText,
                    this.chatWrapper.settings.functions.call.suffix
                ]);
                this.resFunctionCalls.push({
                    functionName: this.functionEvaluationFunctionName,
                    params,
                    raw: functionCallText
                });
                this.onFunctionCall?.({
                    functionName: this.functionEvaluationFunctionName,
                    params: structuredClone(params),
                    raw: functionCallText.toJSON()
                });
                this.currentFunctionCallPreviousText = LlamaText([]);
                this.currentFunctionCallCurrentPartTokens.length = 0;
                this.functionEvaluationFunctionName = "";
                if (this.chatWrapper.settings.functions.parallelism == null || (this.maxParallelFunctionCalls != null && this.maxParallelFunctionCalls <= this.resFunctionCalls.length)) {
                    this.functionEvaluationMode = false;
                    return this.returnFunctionCallResults();
                }
                this.functionEvaluationMode = "sectionSuffixOrBetweenCalls";
                continue;
            }
            else if (this.functionEvaluationMode === "sectionSuffixOrBetweenCalls") {
                const sectionSuffixDetector = new StopGenerationDetector();
                let isFirstToken = true;
                this.functionsGrammar = undefined;
                this.functionsEvaluationState = undefined;
                this.currentFunctionCallPreviousText = LlamaText([]);
                this.currentFunctionCallCurrentPartTokens.length = 0;
                StopGenerationDetector.resolveStopTriggers([
                    ...(this.chatWrapper.settings.functions.parallelism?.call?.sectionSuffix != null
                        ? [this.chatWrapper.settings.functions.parallelism?.call?.sectionSuffix]
                        : []),
                    LlamaText(new SpecialToken("EOS")),
                    LlamaText(new SpecialToken("EOT"))
                ], this.llamaChat.model.tokenizer)
                    .map((stopTrigger) => sectionSuffixDetector.addStopTrigger(stopTrigger));
                for await (const token of this.evaluateWithContextShift(loadContextWindow)) {
                    this.currentFunctionCallCurrentPartTokens.push(token);
                    sectionSuffixDetector.recordGeneration({
                        text: this.currentText,
                        tokens: this.currentTokens,
                        startNewChecks: isFirstToken,
                        triggerMustStartWithGeneration: true
                    });
                    isFirstToken = false;
                    if (sectionSuffixDetector.hasTriggeredStops || !sectionSuffixDetector.hasInProgressStops)
                        break;
                }
                const abortRes = this.handleAbortTrigger("model");
                if (abortRes != null)
                    return abortRes;
                if (sectionSuffixDetector.hasTriggeredStops) {
                    this.functionEvaluationMode = false;
                    return this.returnFunctionCallResults();
                }
                this.functionEvaluationMode = "functionName";
                this.initiallyEngagedFunctionMode = false;
                continue;
            }
            break;
        }
        return undefined;
    }
    releasePartiallyFreeTokensBeforeFunctionCallStart() {
        if (this.releasedPartiallyFreeTokensBeforeFunctionCallStartSyntax)
            return;
        this.stopGenerationDetector.clearInProgressStops();
        this.customStopGenerationTriggersDetector.clearInProgressStops();
        pushAll(this.pendingTokens, this.streamRegulator.popFreeChunkTokens());
        const triggeredStops = this.functionSyntaxStartDetector.getTriggeredStops();
        const partiallyFreeTokens = this.streamRegulator.getPartiallyFreeChunk(this.llamaChat.model.tokenizer);
        const queuedTokensBeforeStopTrigger = getQueuedTokensBeforeStopTrigger(triggeredStops, partiallyFreeTokens, this.llamaChat.model.tokenizer);
        pushAll(this.pendingTokens, queuedTokensBeforeStopTrigger);
        this.removeFoundStartIgnoreTextsFromPendingTokens(true);
        this.pushPendingTokensAndCallOnToken();
        this.streamRegulator.clearQueue();
        this.releasedPartiallyFreeTokensBeforeFunctionCallStartSyntax = true;
    }
    returnFunctionCallResults() {
        if (this.resFunctionCalls.length > 0) {
            this.releasePartiallyFreeTokensBeforeFunctionCallStart();
            let modelResponse = this.llamaChat.model.detokenize(this.res);
            let contextWindowModelResponse = this.llamaChat.model.detokenize(this.contextWindowsRes);
            if (this.grammar?.trimWhitespaceSuffix || this.trimWhitespaceSuffix) {
                modelResponse = modelResponse.trimEnd();
                contextWindowModelResponse = contextWindowModelResponse.trimEnd();
            }
            return {
                response: modelResponse,
                lastEvaluation: {
                    contextWindow: setLastTextInChatHistory("model", this.lastContextWindowHistory, this.contextWindowLastModelResponse + contextWindowModelResponse),
                    cleanHistory: setLastTextInChatHistory("model", this.resolvedHistory, this.lastModelResponse + modelResponse),
                    contextShiftMetadata: this.lastHistoryCompressionMetadata
                },
                functionCalls: this.resFunctionCalls.map((functionCall) => {
                    return {
                        functionName: functionCall.functionName,
                        params: functionCall.params,
                        raw: functionCall.raw.toJSON()
                    };
                }), // prevent infinite TS type instantiation
                metadata: {
                    stopReason: "functionCalls"
                }
            };
        }
        return undefined;
    }
    async *evaluateWithContextShift(loadContextWindow) {
        while (true) {
            this.startTokenLoop();
            await loadContextWindow();
            await this.alignCurrentSequenceStateWithCurrentTokens();
            await this.createNewEvaluationIterator();
            while (await this.iterateEvaluation()) {
                if (this.currentToken == null)
                    break;
                yield this.currentToken;
                if (this.shouldAbort)
                    return;
                if (this.updateShouldContextShift())
                    break;
                if (this.restartEvaluationIterator) {
                    await this.createNewEvaluationIterator();
                }
            }
            this.isFirstEvaluation = false;
            if (this.shouldContextShift)
                continue;
            break;
        }
        throw new Error("The context size is too small to generate a response");
    }
    async alignCurrentSequenceStateWithCurrentTokens() {
        let { firstDifferentIndex } = this.llamaChat.sequence.compareContextTokens(this.tokens);
        // we need to decode at least one token to generate a response
        if (firstDifferentIndex === this.tokens.length && firstDifferentIndex > 0)
            firstDifferentIndex -= 1;
        this.tokens.splice(0, firstDifferentIndex);
        if (firstDifferentIndex < this.llamaChat.sequence.nextTokenIndex) {
            await this.llamaChat.sequence.eraseContextTokenRanges([{
                    start: firstDifferentIndex,
                    end: this.llamaChat.sequence.nextTokenIndex
                }]);
            this.ensureNotAborted();
        }
    }
    async evaluateWithoutGeneratingNewTokens() {
        if (this.evaluationIterator != null)
            await this.evaluationIterator.return();
        await this.llamaChat.sequence.evaluateWithoutGeneratingNewTokens(this.tokens, removeNullFields({
            evaluationPriority: this.evaluationPriority
        }));
    }
    async createNewEvaluationIterator() {
        if (this.evaluationIterator != null)
            await this.evaluationIterator.return();
        this.currentIterationReplacementToken = undefined;
        this.restartEvaluationIterator = false;
        this.evaluationIterator = this.llamaChat.sequence.evaluate(this.tokens, removeNullFields({
            temperature: this.temperature,
            minP: this.minP,
            topK: this.topK,
            topP: this.topP,
            grammarEvaluationState: () => {
                if (this.functionEvaluationMode !== false)
                    return this.functionsEvaluationState;
                return this.grammarEvaluationState;
            },
            repeatPenalty: !this.repeatPenaltyEnabled ? undefined : {
                punishTokens: this.getPenaltyTokens,
                penalty: this.resolvedRepeatPenalty.penalty,
                frequencyPenalty: this.resolvedRepeatPenalty.frequencyPenalty,
                presencePenalty: this.resolvedRepeatPenalty.presencePenalty
            },
            tokenBias: this.tokenBias,
            evaluationPriority: this.evaluationPriority,
            yieldEogToken: true
        }));
    }
    async iterateEvaluation() {
        this.currentIteration = await this.evaluationIterator?.next(this.currentIterationReplacementToken);
        this.currentIterationReplacementToken = undefined;
        this.ensureNotAborted();
        this.generatedTokens++;
        if (this.currentIteration != null && this.currentIteration?.done !== true) {
            this.currentToken = this.currentIteration.value;
            this.currentTokens = [this.currentToken];
            this.currentText = this.llamaChat.model.detokenize(this.currentTokens, false, this.getLastTokens());
            if (this.functionEvaluationMode === false)
                this.currentQueuedTokenRelease = this.streamRegulator.addChunk({
                    tokens: this.currentTokens,
                    text: this.currentText
                });
            else
                this.currentQueuedTokenRelease = undefined;
            return true;
        }
        return false;
    }
    waitOnPartialCharactersOrWhiteSpaceTokens() {
        if (this.currentText.endsWith(UNKNOWN_UNICODE_CHAR) || ((this.grammar?.trimWhitespaceSuffix || this.trimWhitespaceSuffix) && this.currentText?.trim() === "") || (this.currentText === "" && this.locksToReleaseOnValidGeneration.length > 0 &&
            !this.llamaChat.model.isSpecialToken(this.currentToken))) {
            if (this.currentQueuedTokenRelease != null)
                this.locksToReleaseOnValidGeneration.push(this.currentQueuedTokenRelease.createTextIndexLock(0));
        }
        else {
            while (this.locksToReleaseOnValidGeneration.length > 0)
                this.locksToReleaseOnValidGeneration.shift().dispose();
        }
    }
    detectAndHandleFunctionStartSyntax() {
        this.functionSyntaxStartDetector.recordGeneration({
            text: this.currentText,
            tokens: this.currentTokens,
            queuedTokenRelease: this.currentQueuedTokenRelease
        });
        if (this.currentQueuedTokenRelease != null && this.functionEvaluationMode === false && this.functionsEnabled &&
            this.functionSyntaxStartDetector.hasTriggeredStops) {
            this.functionEvaluationMode = "functionName";
            this.currentQueuedTokenRelease.createTextIndexLock(0);
            this.stopGenerationDetector.clearTriggeredStops();
            this.stopGenerationDetector.clearInProgressStops();
            this.customStopGenerationTriggersDetector.clearTriggeredStops();
            this.customStopGenerationTriggersDetector.clearInProgressStops();
            pushAll(this.pendingTokens, this.streamRegulator.popFreeChunkTokens());
            const triggeredStops = this.functionSyntaxStartDetector.getTriggeredStops();
            const partiallyFreeTokens = this.streamRegulator.getPartiallyFreeChunk(this.llamaChat.model.tokenizer);
            const queuedTokensBeforeStopTrigger = getQueuedTokensBeforeStopTrigger(triggeredStops, partiallyFreeTokens, this.llamaChat.model.tokenizer);
            pushAll(this.pendingTokens, queuedTokensBeforeStopTrigger);
            const { firstRemainingGenerationAfterStop, stopTrigger } = StopGenerationDetector.getFirstRemainingGenerationAfterStop(triggeredStops);
            const remainingTextAfterStop = StopGenerationDetector.detokenizeRemainingGeneration(firstRemainingGenerationAfterStop, stopTrigger, this.llamaChat.model.tokenizer);
            this.currentFunctionCallPreviousPartLeftoverText = remainingTextAfterStop;
        }
    }
    recordStopGenerationEvaluation() {
        this.stopGenerationDetector.recordGeneration({
            text: this.currentText,
            tokens: this.currentTokens,
            queuedTokenRelease: this.currentQueuedTokenRelease
        });
        this.customStopGenerationTriggersDetector.recordGeneration({
            text: this.currentText,
            tokens: this.currentTokens,
            queuedTokenRelease: this.currentQueuedTokenRelease
        });
    }
    popStreamRegulatorFreeTokens() {
        pushAll(this.pendingTokens, this.streamRegulator.popFreeChunkTokens());
    }
    handleStopGenerationTrigger(lastHistoryItemType) {
        if (this.stopGenerationDetector.hasTriggeredStops || this.customStopGenerationTriggersDetector.hasTriggeredStops ||
            this.llamaChat.model.isEogToken(this.currentToken)) {
            this.stopGenerationDetector.clearInProgressStops();
            this.customStopGenerationTriggersDetector.clearInProgressStops();
            pushAll(this.pendingTokens, this.streamRegulator.popFreeChunkTokens());
            const triggeredStops = this.stopGenerationDetector.hasTriggeredStops
                ? this.stopGenerationDetector.getTriggeredStops()
                : this.customStopGenerationTriggersDetector.getTriggeredStops();
            const partiallyFreeTokens = this.streamRegulator.getPartiallyFreeChunk(this.llamaChat.model.tokenizer);
            const queuedTokensBeforeStopTrigger = getQueuedTokensBeforeStopTrigger(triggeredStops, partiallyFreeTokens, this.llamaChat.model.tokenizer);
            pushAll(this.pendingTokens, queuedTokensBeforeStopTrigger);
            const { firstRemainingGenerationAfterStop } = StopGenerationDetector.getFirstRemainingGenerationAfterStop(triggeredStops);
            this.removeFoundStartIgnoreTextsFromPendingTokens(true);
            this.pushPendingTokensAndCallOnToken();
            let modelResponse = this.llamaChat.model.detokenize(this.res);
            let contextWindowModelResponse = this.llamaChat.model.detokenize(this.contextWindowsRes);
            if (this.grammar?.trimWhitespaceSuffix || this.trimWhitespaceSuffix) {
                modelResponse = modelResponse.trimEnd();
                contextWindowModelResponse = contextWindowModelResponse.trimEnd();
            }
            const lastEvaluation = {
                contextWindow: setLastTextInChatHistory(lastHistoryItemType, this.lastContextWindowHistory, this.contextWindowLastModelResponse + contextWindowModelResponse),
                cleanHistory: setLastTextInChatHistory(lastHistoryItemType, this.resolvedHistory, this.lastModelResponse + modelResponse),
                contextShiftMetadata: this.lastHistoryCompressionMetadata
            };
            const isEogToken = this.llamaChat.model.isEogToken(this.currentToken);
            if (isEogToken || this.stopGenerationDetector.hasTriggeredStops) {
                return {
                    response: modelResponse,
                    lastEvaluation,
                    metadata: {
                        remainingGenerationAfterStop: firstRemainingGenerationAfterStop,
                        stopReason: isEogToken
                            ? "eogToken"
                            : "stopGenerationTrigger"
                    }
                };
            }
            return {
                response: modelResponse,
                lastEvaluation,
                metadata: {
                    remainingGenerationAfterStop: firstRemainingGenerationAfterStop,
                    stopReason: "customStopTrigger",
                    customStopTrigger: triggeredStops[0].stopTrigger
                }
            };
        }
        return undefined;
    }
    spliceIgnoreStartTextDetectedTokens() {
        if (this.res.length === 0) {
            this.ignoreStartTextDetector.clearInProgressStops();
            this.ignoreStartTextDetector.clearTriggeredStops();
            const lastTokensForDetokenizer = resolveLastTokens([
                this.contextWindowTokens,
                this.ignoredStartTextTokens
            ]);
            this.ignoreStartTextDetector.recordGeneration({
                text: this.llamaChat.model.detokenize(this.pendingTokens, false, lastTokensForDetokenizer),
                tokens: this.pendingTokens
            });
        }
    }
    isMaxTokensTriggered() {
        return this.maxTokens != null && this.maxTokens > 0 && this.generatedTokens >= this.maxTokens;
    }
    moveFreePendingTokensToRes(removeFoundStartIgnoreTextsFromPendingTokens = true) {
        if (this.pendingTokens.length > 0 && (this.isMaxTokensTriggered() || !this.ignoreStartTextDetector.hasInProgressStops)) {
            if (removeFoundStartIgnoreTextsFromPendingTokens)
                this.removeFoundStartIgnoreTextsFromPendingTokens();
            this.pushPendingTokensAndCallOnToken();
        }
    }
    handleMaxTokensTrigger(lastHistoryItemType) {
        if (this.isMaxTokensTriggered()) {
            let modelResponse = this.llamaChat.model.detokenize(this.res);
            let contextWindowModelResponse = this.llamaChat.model.detokenize(this.contextWindowsRes);
            if (this.grammar?.trimWhitespaceSuffix || this.trimWhitespaceSuffix) {
                modelResponse = modelResponse.trimEnd();
                contextWindowModelResponse = contextWindowModelResponse.trimEnd();
            }
            return {
                response: modelResponse,
                lastEvaluation: {
                    contextWindow: setLastTextInChatHistory(lastHistoryItemType, this.lastContextWindowHistory, this.contextWindowLastModelResponse + contextWindowModelResponse),
                    cleanHistory: setLastTextInChatHistory(lastHistoryItemType, this.resolvedHistory, this.lastModelResponse + modelResponse),
                    contextShiftMetadata: this.lastHistoryCompressionMetadata
                },
                metadata: {
                    stopReason: "maxTokens"
                }
            };
        }
        return undefined;
    }
    updateShouldContextShift() {
        this.shouldContextShift = this.llamaChat.sequence.nextTokenIndex >= this.llamaChat.context.contextSize - 1;
        return this.shouldContextShift;
    }
    get shouldAbort() {
        return !!(this.signal?.aborted && this.stopOnAbortSignal);
    }
    handleAbortTrigger(lastHistoryItemType) {
        if (this.shouldAbort && this.signal?.aborted && this.stopOnAbortSignal) {
            if (this.res.length === 0)
                throw this.signal.reason;
            let modelResponse = this.llamaChat.model.detokenize(this.res);
            let contextWindowModelResponse = this.llamaChat.model.detokenize(this.contextWindowsRes);
            if (this.grammar?.trimWhitespaceSuffix || this.trimWhitespaceSuffix) {
                modelResponse = modelResponse.trimEnd();
                contextWindowModelResponse = contextWindowModelResponse.trimEnd();
            }
            return {
                response: modelResponse,
                lastEvaluation: {
                    contextWindow: setLastTextInChatHistory(lastHistoryItemType, this.lastContextWindowHistory, this.contextWindowLastModelResponse + contextWindowModelResponse),
                    cleanHistory: setLastTextInChatHistory(lastHistoryItemType, this.resolvedHistory, this.lastModelResponse + modelResponse),
                    contextShiftMetadata: this.lastHistoryCompressionMetadata
                },
                metadata: {
                    stopReason: "abort"
                }
            };
        }
        return undefined;
    }
    pushPendingTokensAndCallOnToken() {
        if (this.pendingTokens.length === 0)
            return;
        this.onToken?.(this.pendingTokens.slice());
        this.onTextChunk?.(this.llamaChat.model.detokenize(this.pendingTokens, false, this.res));
        pushAll(this.res, this.pendingTokens);
        pushAll(this.contextWindowsRes, this.pendingTokens);
        this.pendingTokens.length = 0;
    }
    getLastTokens(maxTokens = maxRecentDetokenizerTokens) {
        return resolveLastTokens([
            this.contextWindowTokens,
            this.ignoredStartTextTokens,
            this.pendingTokens,
            this.streamRegulator.getLastQueuedChunkTokens(maxTokens),
            this.getContextWindowFunctionCallsTokens()
        ], maxTokens);
    }
}
//# sourceMappingURL=LlamaChat.js.map