import { ChatHistoryItem, ChatModelFunctionCall, ChatModelFunctions, ChatModelResponse, ChatWrapperGenerateContextStateOptions, ChatWrapperGeneratedContextState, ChatWrapperGenerateInitialHistoryOptions, ChatWrapperSettings } from "./types.js";
import { LlamaText } from "./utils/LlamaText.js";
export declare abstract class ChatWrapper {
    static defaultSettings: ChatWrapperSettings;
    abstract readonly wrapperName: string;
    readonly settings: ChatWrapperSettings;
    generateContextState({ chatHistory, availableFunctions, documentFunctionParams }: ChatWrapperGenerateContextStateOptions): ChatWrapperGeneratedContextState;
    generateFunctionCallsAndResults(functionCalls: ChatModelFunctionCall[], useRawCall?: boolean): import("./utils/LlamaText.js")._LlamaText;
    generateFunctionCall(name: string, params: any): LlamaText;
    generateFunctionCallResult(functionName: string, functionParams: any, result: any): LlamaText;
    generateModelResponseText(modelResponse: ChatModelResponse["response"], useRawCall?: boolean): LlamaText;
    generateAvailableFunctionsSystemText(availableFunctions: ChatModelFunctions, { documentParams }: {
        documentParams?: boolean;
    }): LlamaText;
    addAvailableFunctionsSystemMessageToHistory(history: readonly ChatHistoryItem[], availableFunctions?: ChatModelFunctions, { documentParams }?: {
        documentParams?: boolean;
    }): readonly ChatHistoryItem[];
    generateInitialChatHistory({ systemPrompt }: ChatWrapperGenerateInitialHistoryOptions): ChatHistoryItem[];
}
