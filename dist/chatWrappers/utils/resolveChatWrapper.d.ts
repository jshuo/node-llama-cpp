import { Llama3ChatWrapper } from "../Llama3ChatWrapper.js";
import { Llama2ChatWrapper } from "../Llama2ChatWrapper.js";
import { ChatMLChatWrapper } from "../ChatMLChatWrapper.js";
import { GeneralChatWrapper } from "../GeneralChatWrapper.js";
import { FalconChatWrapper } from "../FalconChatWrapper.js";
import { FunctionaryChatWrapper } from "../FunctionaryChatWrapper.js";
import { AlpacaChatWrapper } from "../AlpacaChatWrapper.js";
import { GemmaChatWrapper } from "../GemmaChatWrapper.js";
import { JinjaTemplateChatWrapper } from "../generic/JinjaTemplateChatWrapper.js";
import { TemplateChatWrapper } from "../generic/TemplateChatWrapper.js";
import { Llama3_1ChatWrapper } from "../Llama3_1ChatWrapper.js";
import { Tokenizer } from "../../types.js";
import type { GgufFileInfo } from "../../gguf/types/GgufFileInfoTypes.js";
export declare const specializedChatWrapperTypeNames: readonly ["general", "llama3.1", "llama3", "llama2Chat", "alpacaChat", "functionary", "chatML", "falconChat", "gemma"];
export type SpecializedChatWrapperTypeName = (typeof specializedChatWrapperTypeNames)[number];
export declare const templateChatWrapperTypeNames: readonly ["template", "jinjaTemplate"];
export type TemplateChatWrapperTypeName = (typeof templateChatWrapperTypeNames)[number];
export declare const resolvableChatWrapperTypeNames: readonly ["auto", "general", "llama3.1", "llama3", "llama2Chat", "alpacaChat", "functionary", "chatML", "falconChat", "gemma", "template", "jinjaTemplate"];
export type ResolvableChatWrapperTypeName = (typeof resolvableChatWrapperTypeNames)[number];
declare const chatWrappers: {
    readonly general: typeof GeneralChatWrapper;
    readonly "llama3.1": typeof Llama3_1ChatWrapper;
    readonly llama3: typeof Llama3ChatWrapper;
    readonly llama2Chat: typeof Llama2ChatWrapper;
    readonly alpacaChat: typeof AlpacaChatWrapper;
    readonly functionary: typeof FunctionaryChatWrapper;
    readonly chatML: typeof ChatMLChatWrapper;
    readonly falconChat: typeof FalconChatWrapper;
    readonly gemma: typeof GemmaChatWrapper;
    readonly template: typeof TemplateChatWrapper;
    readonly jinjaTemplate: typeof JinjaTemplateChatWrapper;
};
export type ResolveChatWrapperOptions = {
    /**
     * Resolve to a specific chat wrapper type.
     * You better not set this option unless you need to force a specific chat wrapper type.
     *
     * Defaults to `"auto"`.
     */
    type?: "auto" | SpecializedChatWrapperTypeName | TemplateChatWrapperTypeName;
    bosString?: string | null;
    filename?: string;
    fileInfo?: GgufFileInfo;
    tokenizer?: Tokenizer;
    customWrapperSettings?: {
        [wrapper in keyof typeof chatWrappers]?: ConstructorParameters<(typeof chatWrappers)[wrapper]>[0];
    };
    warningLogs?: boolean;
    fallbackToOtherWrappersOnJinjaError?: boolean;
    /**
     * Don't resolve to a Jinja chat wrapper unless `type` is set to a Jinja chat wrapper type.
     */
    noJinja?: boolean;
};
/**
 * Resolve to a chat wrapper instance based on the provided information.
 * The more information provided, the better the resolution will be (except for `type`).
 *
 * It's recommended to not set `type` to a specific chat wrapper in order for the resolution to be more flexible, but it is useful for when
 * you need to provide the ability to force a specific chat wrapper type.
 * Note that when setting `type` to a generic chat wrapper type (such as `"template"` or `"jinjaTemplate"`), the `customWrapperSettings`
 * must contain the necessary settings for that chat wrapper to be created.
 *
 * When loading a Jinja chat template from either `fileInfo` or `customWrapperSettings.jinjaTemplate.template`,
 * if the chat template format is invalid, it fallbacks to resolve other chat wrappers,
 * unless `fallbackToOtherWrappersOnJinjaError` is set to `false` (in which case, it will throw an error).
 */
export declare function resolveChatWrapper({ type, bosString, filename, fileInfo, tokenizer, customWrapperSettings, warningLogs, fallbackToOtherWrappersOnJinjaError, noJinja }: ResolveChatWrapperOptions): any;
export declare function isSpecializedChatWrapperType(type: string): type is SpecializedChatWrapperTypeName;
export declare function isTemplateChatWrapperType(type: string): type is TemplateChatWrapperTypeName;
export {};
