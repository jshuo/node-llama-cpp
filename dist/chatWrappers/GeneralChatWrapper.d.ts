import { ChatWrapper } from "../ChatWrapper.js";
import { ChatWrapperGenerateContextStateOptions, ChatWrapperGeneratedContextState } from "../types.js";
export declare class GeneralChatWrapper extends ChatWrapper {
    readonly wrapperName: string;
    constructor({ userMessageTitle, modelResponseTitle, middleSystemMessageTitle, allowSpecialTokensInTitles }?: {
        userMessageTitle?: string;
        modelResponseTitle?: string;
        middleSystemMessageTitle?: string;
        allowSpecialTokensInTitles?: boolean;
    });
    get userMessageTitle(): string;
    get modelResponseTitle(): string;
    get middleSystemMessageTitle(): string;
    generateContextState({ chatHistory, availableFunctions, documentFunctionParams }: ChatWrapperGenerateContextStateOptions): ChatWrapperGeneratedContextState;
}
