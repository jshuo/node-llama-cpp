import { ChatWrapper } from "../ChatWrapper.js";
import { ChatHistoryItem, ChatModelFunctions, ChatWrapperGenerateContextStateOptions, ChatWrapperGeneratedContextState, ChatWrapperGenerateInitialHistoryOptions, ChatWrapperSettings } from "../types.js";
export declare class Llama3_1ChatWrapper extends ChatWrapper {
    readonly wrapperName: string;
    readonly cuttingKnowledgeDate?: Date | null;
    readonly todayDate: Date | null;
    readonly settings: ChatWrapperSettings;
    /**
     * @param options
     */
    constructor({ cuttingKnowledgeDate, todayDate }?: {
        /**
         * Set to `null` to disable
         * @default December 2023
         */
        cuttingKnowledgeDate?: Date | number | string | null;
        /**
         * Set to `null` to disable
         * @default current date
         */
        todayDate?: Date | number | string | null;
    });
    addAvailableFunctionsSystemMessageToHistory(history: readonly ChatHistoryItem[], availableFunctions?: ChatModelFunctions, { documentParams }?: {
        documentParams?: boolean;
    }): readonly ChatHistoryItem[];
    generateContextState({ chatHistory, availableFunctions, documentFunctionParams }: ChatWrapperGenerateContextStateOptions): ChatWrapperGeneratedContextState;
    generateAvailableFunctionsSystemText(availableFunctions: ChatModelFunctions, { documentParams }: {
        documentParams?: boolean;
    }): import("../utils/LlamaText.js")._LlamaText;
    generateInitialChatHistory({ systemPrompt }: ChatWrapperGenerateInitialHistoryOptions): ChatHistoryItem[];
}
