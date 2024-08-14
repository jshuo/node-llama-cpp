import { ChatWrapperGenerateContextStateOptions, ChatWrapperGeneratedContextState, ChatWrapperSettings } from "../../types.js";
import { ChatWrapper } from "../../ChatWrapper.js";
import { ChatHistoryFunctionCallMessageTemplate } from "./utils/chatHistoryFunctionCallMessageTemplate.js";
export type JinjaTemplateChatWrapperOptions = {
    template: string;
    /**
     * Defaults to `"assistant"`.
     */
    modelRoleName?: string;
    /**
     * Defaults to `"user"`.
     */
    userRoleName?: string;
    /**
     * Defaults to `"system"`.
     */
    systemRoleName?: string;
    /**
     * Some Jinja templates may not support system messages, and in such cases,
     * it'll be detected and system messages can be converted to user messages.
     *
     * You can specify the format of the converted user message.
     * - **"auto"**: Convert system messages to user messages only if the template does not support system messages.
     * - **`true`**: Always convert system messages to user messages.
     * - **`false`**: Never convert system messages to user messages.
     * May throw an error if some system messages don't appear in the template.
     * - **`{use: "ifNeeded", format: "..."}`**: Convert system messages to user messages only if the template does not support system
     * messages with the specified format.
     * - **`{use: "always", format: "..."}`**: Always convert system messages to user messages with the specified format.
     *
     * Defaults to `"auto"`.
     */
    convertUnsupportedSystemMessagesToUserMessages?: "auto" | boolean | JinjaTemplateChatWrapperOptionsConvertMessageFormat;
    functionCallMessageTemplate?: ChatHistoryFunctionCallMessageTemplate;
    /**
     * Whether to join adjacent messages of the same type.
     * Some Jinja templates may throw an error if this is not set to `true`.
     *
     * Defaults to `true`.
     */
    joinAdjacentMessagesOfTheSameType?: boolean;
    /**
     * Whether to trim leading whitespace in responses.
     *
     * Defaults to `true`.
     */
    trimLeadingWhitespaceInResponses?: boolean;
};
export type JinjaTemplateChatWrapperOptionsConvertMessageFormat = {
    use?: "always" | "ifNeeded";
    format: `${string}{{message}}${string}`;
};
/**
 * A chat wrapper based on a Jinja template.
 * Useful for using the original model's Jinja template as-is without any additional conversion work to chat with a model.
 *
 * If you want to create a new chat wrapper from scratch, using this chat wrapper is not recommended, and instead you better inherit
 * from the `ChatWrapper` class and implement a custom chat wrapper of your own in TypeScript.
 *
 * For a simpler way to create a chat wrapper, see the `TemplateChatWrapper` class.
 */
export declare class JinjaTemplateChatWrapper extends ChatWrapper {
    readonly wrapperName = "JinjaTemplate";
    readonly settings: ChatWrapperSettings;
    readonly template: string;
    readonly modelRoleName: string;
    readonly userRoleName: string;
    readonly systemRoleName: string;
    readonly convertUnsupportedSystemMessagesToUserMessages?: JinjaTemplateChatWrapperOptionsConvertMessageFormat;
    readonly joinAdjacentMessagesOfTheSameType: boolean;
    readonly trimLeadingWhitespaceInResponses: boolean;
    constructor({ template, modelRoleName, userRoleName, systemRoleName, convertUnsupportedSystemMessagesToUserMessages, functionCallMessageTemplate, joinAdjacentMessagesOfTheSameType, trimLeadingWhitespaceInResponses }: JinjaTemplateChatWrapperOptions);
    generateContextState({ chatHistory, availableFunctions, documentFunctionParams }: ChatWrapperGenerateContextStateOptions): ChatWrapperGeneratedContextState & {
        transformedSystemMessagesToUserMessages: boolean;
    };
}
