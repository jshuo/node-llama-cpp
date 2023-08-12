import {defaultChatSystemPrompt} from "./config.js";
import {withLock} from "./utils/withLock.js";
import {LlamaModel} from "./LlamaModel.js";
import {ChatPromptWrapper} from "./ChatPromptWrapper.js";
import {LlamaChatPromptWrapper} from "./chatWrappers/LlamaChatPromptWrapper.js";
import {AbortError} from "./AbortError.js";


export class LlamaChatSession {
    private readonly _model: LlamaModel;
    private readonly _systemPrompt: string;
    private readonly _printLLamaSystemInfo: boolean;
    private readonly _promptWrapper: ChatPromptWrapper;
    private _promptIndex: number = 0;
    private _initialized: boolean = false;

    public constructor({
        model,
        printLLamaSystemInfo = false,
        promptWrapper = new LlamaChatPromptWrapper(),
        systemPrompt = defaultChatSystemPrompt
    }: {
        model: LlamaModel,
        printLLamaSystemInfo?: boolean,
        promptWrapper?: ChatPromptWrapper,
        systemPrompt?: string,
    }) {
        this._model = model;
        this._printLLamaSystemInfo = printLLamaSystemInfo;
        this._promptWrapper = promptWrapper;

        this._systemPrompt = systemPrompt;
    }

    public get initialized() {
        return this._initialized;
    }

    public get model() {
        return this._model;
    }

    public async init() {
        await withLock(this, "init", async () => {
            if (this._initialized)
                return;

            if (this._printLLamaSystemInfo)
                console.log("Llama system info", this._model.systemInfo);

            this._initialized = true;
        });
    }

    public async prompt(prompt: string, onToken?: (token: number) => void, {signal}: {signal?: AbortSignal} = {}) {
        if (!this.initialized)
            await this.init();

        return await withLock(this, "prompt", async () => {
            const promptText = this._promptWrapper.wrapPrompt(prompt, {systemPrompt: this._systemPrompt, promptIndex: this._promptIndex});
            this._promptIndex++;

            return await this._evalTokens(this._model.encode(promptText), onToken, {signal});
        });
    }

    private async _evalTokens(tokens: Uint32Array, onToken?: (token: number) => void, {signal}: {signal?: AbortSignal} = {}) {
        const stopStrings = this._promptWrapper.getStopStrings();
        const stopStringIndexes = Array(stopStrings.length).fill(0);
        const skippedChunksQueue: number[] = [];
        let res = "";

        for await (const chunk of this._model.evaluate(tokens)) {
            if (signal?.aborted)
                throw new AbortError();

            const tokenStr = this._model.decode(Uint32Array.from([chunk]));
            let skipTokenEvent = false;

            for (let stopStringIndex = 0; stopStringIndex < stopStrings.length; stopStringIndex++) {
                const stopString = stopStrings[stopStringIndex];

                let localShouldSkipTokenEvent = false;
                for (let i = 0; i < tokenStr.length && stopStringIndexes[stopStringIndex] !== stopString.length; i++) {
                    if (tokenStr[i] === stopString[stopStringIndexes[stopStringIndex]]) {
                        stopStringIndexes[stopStringIndex]++;
                        localShouldSkipTokenEvent = true;
                    } else {
                        stopStringIndexes[stopStringIndex] = 0;
                        localShouldSkipTokenEvent = false;
                        break;
                    }
                }

                if (stopStringIndexes[stopStringIndex] === stopString.length) {
                    return res;
                }

                skipTokenEvent ||= localShouldSkipTokenEvent;
            }

            if (skipTokenEvent) {
                skippedChunksQueue.push(chunk);
                continue;
            }

            while (skippedChunksQueue.length > 0) {
                const token = skippedChunksQueue.shift()!;
                res += this._model.decode(Uint32Array.from([token]));
                onToken?.(token);
            }

            res += tokenStr;
            onToken?.(chunk);
        }

        return res;
    }
}