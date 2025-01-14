import { DisposeAggregator, DisposedError, EventRelay, withLock } from "lifecycle-utils";
import { tokenizeInput } from "../utils/tokenizeInput.js";
import { UnsupportedError } from "../utils/UnsupportedError.js";
import { removeNullFields } from "../utils/removeNullFields.js";
import { TokenStreamRegulator } from "../utils/TokenStreamRegulator.js";
import { StopGenerationDetector } from "../utils/StopGenerationDetector.js";
import { UNKNOWN_UNICODE_CHAR } from "../consts.js";
import { getQueuedTokensBeforeStopTrigger } from "../utils/getQueuedTokensBeforeStopTrigger.js";
import { safeEventCallback } from "../utils/safeEventCallback.js";
import { pushAll } from "../utils/pushAll.js";
import { LlamaGrammarEvaluationState } from "./LlamaGrammarEvaluationState.js";
const defaultContextShiftSize = ((sequence) => Math.max(1, Math.floor(sequence.context.contextSize / 10)));
const defaultMinPrefixKeepTokens = ((sequence) => Math.max(1, Math.floor(sequence.context.contextSize / 10)));
export class LlamaCompletion {
    /** @internal */ _disposeAggregator = new DisposeAggregator();
    /** @internal */ _autoDisposeSequence;
    /** @internal */ _sequence;
    onDispose = new EventRelay();
    constructor({ contextSequence, autoDisposeSequence = true }) {
        this._sequence = contextSequence;
        this._autoDisposeSequence = autoDisposeSequence;
        this._disposeAggregator.add(this._sequence.onDispose.createListener(() => {
            this.dispose();
        }));
        this._disposeAggregator.add(this.onDispose.dispatchEvent);
    }
    dispose({ disposeSequence = this._autoDisposeSequence } = {}) {
        if (this._sequence == null || this.disposed)
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
        return this._sequence == null || this._sequence.disposed;
    }
    get infillSupported() {
        if (this._sequence == null)
            throw new DisposedError();
        return this._sequence.model.tokens.infill.prefix != null &&
            this._sequence.model.tokens.infill.suffix != null &&
            this._sequence.model.tokens.infill.middle != null;
    }
    /**
     * Generate a completion for an input.
     */
    async generateCompletion(input, options = {}) {
        const { response } = await this.generateCompletionWithMeta(input, options);
        return response;
    }
    /**
     * Same as `generateCompletion`, but returns additional metadata about the generation.
     * See `generateCompletion` for more information.
     */
    async generateCompletionWithMeta(input, { onTextChunk, onToken, signal, maxTokens, temperature, minP, topK, topP, trimWhitespaceSuffix = false, repeatPenalty = {}, tokenBias, evaluationPriority = 5, grammar, customStopTriggers, contextShiftSize = defaultContextShiftSize, disableContextShift } = {}) {
        if (this._sequence == null || this.disposed)
            throw new DisposedError();
        const bosToken = this._sequence.model.tokens.bos;
        const shouldPrependBosToken = this._sequence.model.tokens.shouldPrependBosToken;
        async function fitInputIntoContext({ maxTokens, tokens }) {
            const res = [];
            if (shouldPrependBosToken && bosToken != null)
                res.push(bosToken);
            const inputTokensSize = Math.max(0, Math.min(maxTokens - res.length, tokens.length));
            if (inputTokensSize === 0 && tokens.length > 0)
                throw new Error("The context size is too small to generate a response for the given input");
            const slicedTokens = tokens.slice(-inputTokensSize);
            pushAll(res, slicedTokens);
            return res;
        }
        const ensureNotAborted = () => {
            if (signal?.aborted)
                throw signal.reason;
            if (this.disposed)
                throw new DisposedError();
        };
        return await withLock(this, "generateCompletion", signal, async () => {
            ensureNotAborted();
            if (this._sequence == null || this.disposed)
                throw new DisposedError();
            const resolvedInput = tokenizeInput(input, this._sequence.model.tokenizer, (shouldPrependBosToken && bosToken != null)
                ? "trimLeadingSpace"
                : undefined);
            const resolvedContextShiftSize = await resolveContextShiftSize(contextShiftSize, this._sequence);
            ensureNotAborted();
            const inputTokens = await fitInputIntoContext({
                maxTokens: this._sequence.context.contextSize - resolvedContextShiftSize,
                tokens: resolvedInput
            });
            ensureNotAborted();
            const resolvedMaxTokens = !disableContextShift
                ? maxTokens
                : (maxTokens != null && maxTokens > 0)
                    ? Math.min(maxTokens, this._sequence.context.contextSize - inputTokens.length)
                    : this._sequence.context.contextSize - inputTokens.length;
            return await this._generateResponse(inputTokens, {
                onTextChunk: safeEventCallback(onTextChunk),
                onToken: safeEventCallback(onToken),
                signal,
                maxTokens: resolvedMaxTokens,
                temperature,
                minP,
                topK,
                topP,
                trimWhitespaceSuffix,
                repeatPenalty,
                tokenBias,
                evaluationPriority,
                grammar,
                contextShiftSize,
                customStopTriggers
            }, {
                async contextShift({ shiftSize, res, pendingTokens, sequence }) {
                    return {
                        newContextState: await fitInputIntoContext({
                            maxTokens: sequence.context.contextSize - shiftSize,
                            tokens: [...resolvedInput, ...res, ...pendingTokens]
                        })
                    };
                }
            });
        });
    }
    /**
     * Infill (also known as Fill-In-Middle), generates a completion for an input (`prefixInput`) that
     * should connect to a given continuation (`suffixInput`).
     * For example, for `prefixInput: "123"` and `suffixInput: "789"`, the model is expected to generate `456`
     * to make the final text be `123456789`.
     */
    async generateInfillCompletion(prefixInput, suffixInput, options = {}) {
        const { response } = await this.generateInfillCompletionWithMeta(prefixInput, suffixInput, options);
        return response;
    }
    /**
     * Same as `generateInfillCompletion`, but returns additional metadata about the generation.
     * See `generateInfillCompletion` for more information.
     */
    async generateInfillCompletionWithMeta(prefixInput, suffixInput, { onTextChunk, onToken, signal, maxTokens, temperature, minP, topK, topP, trimWhitespaceSuffix = false, repeatPenalty = {}, tokenBias, evaluationPriority = 5, grammar, contextShiftSize = defaultContextShiftSize, customStopTriggers, minPrefixKeepTokens = defaultMinPrefixKeepTokens, disableContextShift = false } = {}) {
        if (this._sequence == null || this.disposed)
            throw new DisposedError();
        const prefixToken = this._sequence.model.tokens.infill.prefix;
        const suffixToken = this._sequence.model.tokens.infill.suffix;
        const middleToken = this._sequence.model.tokens.infill.middle;
        const bosToken = this._sequence.model.tokens.bos;
        const shouldPrependBosToken = this._sequence.model.tokens.shouldPrependBosToken;
        if (prefixToken == null || suffixToken == null || middleToken == null)
            throw new UnsupportedError("Infill completions are not supported by this model");
        async function fitInputIntoContext({ maxTokens, prefixTokens, suffixTokens, sequence }) {
            if (prefixToken == null || suffixToken == null || middleToken == null)
                throw new UnsupportedError("Infill completions are not supported by this model");
            // 3 - InfillPrefix token, InfillSuffix token, InfillMiddle token
            const specialTokensInContext = 3 + ((shouldPrependBosToken && bosToken != null)
                ? 1
                : 0);
            const resolvedMaxTokens = maxTokens - specialTokensInContext;
            let sizeLeftToFill = resolvedMaxTokens;
            let suffixTokensSize = Math.min(sizeLeftToFill, suffixTokens.length);
            sizeLeftToFill -= suffixTokensSize;
            let prefixTokensSize = Math.min(sizeLeftToFill, prefixTokens.length);
            sizeLeftToFill -= prefixTokensSize;
            if (sizeLeftToFill <= 0 && disableContextShift)
                throw new Error("The context size is too small to generate a response for the given input, and context shift is disabled. " +
                    "Consider removing `disableContextShift` or reducing the input size.");
            const resolvedMinPrefixKeepTokens = Math.min(Math.min(resolvedMaxTokens, prefixTokens.length), Math.max(1, Math.floor(minPrefixKeepTokens instanceof Function
                ? await minPrefixKeepTokens(sequence)
                : minPrefixKeepTokens)));
            if (prefixTokensSize < resolvedMinPrefixKeepTokens) {
                const diffToFill = Math.min(suffixTokensSize, resolvedMinPrefixKeepTokens - prefixTokensSize);
                prefixTokensSize += diffToFill;
                suffixTokensSize -= diffToFill;
            }
            const resolvedPrefixTokens = prefixTokens.slice(-prefixTokensSize);
            const resolvedSuffixTokens = suffixTokens.slice(0, suffixTokensSize);
            const newContextState = [];
            if (shouldPrependBosToken && bosToken != null)
                newContextState.push(bosToken);
            newContextState.push(prefixToken);
            pushAll(newContextState, resolvedPrefixTokens);
            newContextState.push(suffixToken);
            pushAll(newContextState, resolvedSuffixTokens);
            newContextState.push(middleToken);
            return newContextState;
        }
        const ensureNotAborted = () => {
            if (signal?.aborted)
                throw signal.reason;
            if (this.disposed)
                throw new DisposedError();
        };
        return await withLock(this, "generateCompletion", signal, async () => {
            ensureNotAborted();
            if (this._sequence == null || this.disposed)
                throw new DisposedError();
            const resolvedPrefixInputTokens = tokenizeInput(prefixInput, this._sequence.model.tokenizer, "trimLeadingSpace");
            const resolvedSuffixInputTokens = tokenizeInput(suffixInput, this._sequence.model.tokenizer, "trimLeadingSpace");
            const resolvedContextShiftSize = await resolveContextShiftSize(contextShiftSize, this._sequence);
            ensureNotAborted();
            const inputTokens = await fitInputIntoContext({
                maxTokens: this._sequence.context.contextSize - resolvedContextShiftSize,
                prefixTokens: resolvedPrefixInputTokens,
                suffixTokens: resolvedSuffixInputTokens,
                sequence: this._sequence
            });
            ensureNotAborted();
            const resolvedMaxTokens = !disableContextShift
                ? maxTokens
                : (maxTokens != null && maxTokens > 0)
                    ? Math.min(maxTokens, this._sequence.context.contextSize - inputTokens.length)
                    : this._sequence.context.contextSize - inputTokens.length;
            return await this._generateResponse(inputTokens, {
                onTextChunk: safeEventCallback(onTextChunk),
                onToken: safeEventCallback(onToken),
                signal,
                maxTokens: resolvedMaxTokens,
                temperature,
                minP,
                topK,
                topP,
                trimWhitespaceSuffix,
                repeatPenalty,
                tokenBias,
                evaluationPriority,
                grammar,
                contextShiftSize,
                customStopTriggers
            }, {
                async contextShift({ shiftSize, res, pendingTokens, sequence }) {
                    return {
                        newContextState: await fitInputIntoContext({
                            maxTokens: sequence.context.contextSize - shiftSize,
                            prefixTokens: [...resolvedPrefixInputTokens, ...res, ...pendingTokens],
                            suffixTokens: resolvedSuffixInputTokens,
                            sequence
                        })
                    };
                }
            });
        });
    }
    /** @internal */
    async _generateResponse(tokens, { onTextChunk, onToken, signal, maxTokens, temperature, minP, topK, topP, trimWhitespaceSuffix = false, repeatPenalty = {}, tokenBias, evaluationPriority = 5, grammar, contextShiftSize = defaultContextShiftSize, customStopTriggers }, { contextShift }) {
        if (this._sequence == null)
            throw new DisposedError();
        const sequence = this._sequence;
        const model = sequence.model;
        const context = sequence.context;
        const res = [];
        const pendingTokens = [];
        const grammarEvaluationState = grammar != null
            ? new LlamaGrammarEvaluationState({ grammar })
            : undefined;
        const { lastTokens: repeatPenaltyLastTokens = 64, punishTokensFilter, penalizeNewLine, penalty, frequencyPenalty, presencePenalty } = repeatPenalty === false
            ? { lastTokens: 0 }
            : repeatPenalty;
        const streamRegulator = new TokenStreamRegulator();
        const stopGenerationDetector = new StopGenerationDetector();
        const customStopGenerationTriggersDetector = new StopGenerationDetector();
        const locksToReleaseOnValidGeneration = [];
        const repeatPenaltyEnabled = repeatPenaltyLastTokens > 0;
        let inputTokens = tokens;
        let generatedTokens = 0;
        if (grammar != null)
            StopGenerationDetector.resolveStopTriggers(grammar.stopGenerationTriggers, model.tokenizer)
                .map((stopTrigger) => stopGenerationDetector.addStopTrigger(stopTrigger));
        if (customStopTriggers != null)
            StopGenerationDetector.resolveStopTriggers(customStopTriggers, model.tokenizer)
                .map((stopTrigger) => customStopGenerationTriggersDetector.addStopTrigger(stopTrigger));
        const ensureNotAborted = () => {
            if (signal?.aborted)
                throw signal.reason;
            if (this.disposed)
                throw new DisposedError();
        };
        const getPenaltyTokens = () => {
            if (this._sequence == null)
                throw new DisposedError();
            let punishTokens = res.slice(-repeatPenaltyLastTokens);
            if (punishTokensFilter != null)
                punishTokens = punishTokensFilter(punishTokens);
            if (penalizeNewLine == null || !penalizeNewLine) {
                const nlToken = model.tokens.nl;
                if (nlToken != null)
                    punishTokens = punishTokens.filter(token => token !== nlToken);
            }
            return punishTokens;
        };
        // eslint-disable-next-line no-constant-condition
        while (true) {
            ensureNotAborted();
            let shouldContextShift = false;
            let { firstDifferentIndex } = sequence.compareContextTokens(inputTokens);
            // we need to decode at least one token to generate a response
            if (firstDifferentIndex === inputTokens.length && firstDifferentIndex > 0)
                firstDifferentIndex -= 1;
            inputTokens.splice(0, firstDifferentIndex);
            if (firstDifferentIndex < sequence.nextTokenIndex) {
                await sequence.eraseContextTokenRanges([{
                        start: firstDifferentIndex,
                        end: sequence.nextTokenIndex
                    }]);
                ensureNotAborted();
            }
            const evaluationIterator = sequence.evaluate(inputTokens, removeNullFields({
                temperature, minP, topK, topP,
                grammarEvaluationState,
                repeatPenalty: !repeatPenaltyEnabled ? undefined : {
                    punishTokens: getPenaltyTokens,
                    penalty,
                    frequencyPenalty,
                    presencePenalty
                },
                tokenBias,
                evaluationPriority,
                yieldEogToken: true
            }));
            for await (const token of evaluationIterator) {
                ensureNotAborted();
                generatedTokens++;
                const tokens = [token];
                const text = model.detokenize([token]);
                const queuedTokenRelease = streamRegulator.addChunk({ tokens, text });
                if (text.endsWith(UNKNOWN_UNICODE_CHAR) || ((grammar?.trimWhitespaceSuffix || trimWhitespaceSuffix) && text.trim() === "") || (text === "" && locksToReleaseOnValidGeneration.length > 0 && !model.isSpecialToken(token))) {
                    locksToReleaseOnValidGeneration.push(queuedTokenRelease.createTextIndexLock(0));
                }
                else {
                    while (locksToReleaseOnValidGeneration.length > 0)
                        locksToReleaseOnValidGeneration.shift().dispose();
                }
                stopGenerationDetector.recordGeneration({ text, tokens, queuedTokenRelease });
                customStopGenerationTriggersDetector.recordGeneration({ text, tokens, queuedTokenRelease });
                pushAll(pendingTokens, streamRegulator.popFreeChunkTokens());
                if (stopGenerationDetector.hasTriggeredStops || customStopGenerationTriggersDetector.hasTriggeredStops ||
                    model.isEogToken(token)) {
                    const triggeredStops = stopGenerationDetector.hasTriggeredStops
                        ? stopGenerationDetector.getTriggeredStops()
                        : customStopGenerationTriggersDetector.getTriggeredStops();
                    const partiallyFreeTokens = streamRegulator.getPartiallyFreeChunk(model.tokenizer);
                    const queuedTokensBeforeStopTrigger = getQueuedTokensBeforeStopTrigger(triggeredStops, partiallyFreeTokens, model.tokenizer);
                    pushAll(pendingTokens, queuedTokensBeforeStopTrigger);
                    const { firstRemainingGenerationAfterStop } = StopGenerationDetector.getFirstRemainingGenerationAfterStop(triggeredStops);
                    if (pendingTokens.length > 0) {
                        onToken?.(pendingTokens.slice());
                        onTextChunk?.(model.detokenize(pendingTokens, false, res));
                    }
                    pushAll(res, pendingTokens);
                    pendingTokens.length = 0;
                    let modelResponse = model.detokenize(res);
                    if (grammar?.trimWhitespaceSuffix || trimWhitespaceSuffix)
                        modelResponse = modelResponse.trimEnd();
                    const isEogToken = model.isEogToken(token);
                    if (isEogToken || stopGenerationDetector.hasTriggeredStops)
                        return {
                            response: modelResponse,
                            metadata: {
                                remainingGenerationAfterStop: firstRemainingGenerationAfterStop,
                                stopReason: isEogToken
                                    ? "eogToken"
                                    : "stopGenerationTrigger"
                            }
                        };
                    return {
                        response: modelResponse,
                        metadata: {
                            remainingGenerationAfterStop: firstRemainingGenerationAfterStop,
                            stopReason: "customStopTrigger",
                            customStopTrigger: triggeredStops[0].stopTrigger
                        }
                    };
                }
                if (pendingTokens.length > 0) {
                    onToken?.(pendingTokens.slice());
                    onTextChunk?.(model.detokenize(pendingTokens, false, res));
                    pushAll(res, pendingTokens);
                    pendingTokens.length = 0;
                }
                if (maxTokens != null && maxTokens > 0 && generatedTokens >= maxTokens) {
                    let modelResponse = model.detokenize(res);
                    if (grammar?.trimWhitespaceSuffix || trimWhitespaceSuffix)
                        modelResponse = modelResponse.trimEnd();
                    return {
                        response: modelResponse,
                        metadata: {
                            stopReason: "maxTokens"
                        }
                    };
                }
                if (sequence.nextTokenIndex >= context.contextSize - 1) {
                    shouldContextShift = true;
                    break;
                }
            }
            if (shouldContextShift) {
                const resolvedContextShiftSize = await resolveContextShiftSize(contextShiftSize, sequence);
                ensureNotAborted();
                const { newContextState } = await contextShift({
                    shiftSize: resolvedContextShiftSize,
                    res,
                    pendingTokens,
                    sequence
                });
                ensureNotAborted();
                inputTokens = newContextState;
                continue;
            }
            break;
        }
        throw new Error("The context size is too small to generate a response");
    }
}
async function resolveContextShiftSize(contextShiftSize, sequence) {
    if (typeof contextShiftSize === "number")
        return contextShiftSize;
    else if (contextShiftSize instanceof Function)
        return Math.min(sequence.context.contextSize, Math.max(1, Math.floor(contextShiftSize instanceof Function
            ? await contextShiftSize(sequence)
            : contextShiftSize)));
    return defaultContextShiftSize(sequence);
}
//# sourceMappingURL=LlamaCompletion.js.map