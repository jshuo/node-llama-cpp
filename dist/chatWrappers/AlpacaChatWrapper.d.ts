import { GeneralChatWrapper } from "./GeneralChatWrapper.js";
export declare class AlpacaChatWrapper extends GeneralChatWrapper {
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
}
