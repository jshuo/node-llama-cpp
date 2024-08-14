import { ChatWrapperGenerateContextStateOptions, ChatWrapperGeneratedContextState, ChatWrapperSettings } from "../../types.js";
import { ChatWrapper } from "../../ChatWrapper.js";
import { ChatHistoryFunctionCallMessageTemplate } from "./utils/chatHistoryFunctionCallMessageTemplate.js";
export type TemplateChatWrapperOptions = {
    template: `${"" | `${string}{{systemPrompt}}`}${string}{{history}}${string}{{completion}}${string}`;
    historyTemplate: `${string}{{roleName}}${string}{{message}}${string}`;
    modelRoleName: string;
    userRoleName: string;
    systemRoleName?: string;
    functionCallMessageTemplate?: ChatHistoryFunctionCallMessageTemplate;
    joinAdjacentMessagesOfTheSameType?: boolean;
};
/**
 * A chat wrapper based on a simple template.
 * @example
 * ```typescript
 * const chatWrapper = new TemplateChatWrapper({
 *     template: "{{systemPrompt}}\n{{history}}model:{{completion}}\nuser:",
 *     historyTemplate: "{{roleName}}: {{message}}\n",
 *     modelRoleName: "model",
 *     userRoleName: "user",
 *     systemRoleName: "system", // optional
 *     // functionCallMessageTemplate: { // optional
 *     //     call: "[[call: {{functionName}}({{functionParams}})]]",
 *     //     result: " [[result: {{functionCallResult}}]]"
 *     // }
 * });
 * ```
 *
 * **<span v-pre>`{{systemPrompt}}`</span>** is optional and is replaced with the first system message
 * (when is does, that system message is not included in the history).
 *
 * **<span v-pre>`{{history}}`</span>** is replaced with the chat history.
 * Each message in the chat history is converted using template passed to `historyTemplate`, and all messages are joined together.
 *
 * **<span v-pre>`{{completion}}`</span>** is where the model's response is generated.
 * The text that comes after <span v-pre>`{{completion}}`</span> is used to determine when the model has finished generating the response,
 * and thus is mandatory.
 *
 * **`functionCallMessageTemplate`** is used to specify the format in which functions can be called by the model and
 * how their results are fed to the model after the function call.
 */
export declare class TemplateChatWrapper extends ChatWrapper {
    readonly wrapperName = "Template";
    readonly settings: ChatWrapperSettings;
    readonly template: TemplateChatWrapperOptions["template"];
    readonly historyTemplate: TemplateChatWrapperOptions["historyTemplate"];
    readonly modelRoleName: string;
    readonly userRoleName: string;
    readonly systemRoleName: string;
    readonly joinAdjacentMessagesOfTheSameType: boolean;
    constructor({ template, historyTemplate, modelRoleName, userRoleName, systemRoleName, functionCallMessageTemplate, joinAdjacentMessagesOfTheSameType }: TemplateChatWrapperOptions);
    generateContextState({ chatHistory, availableFunctions, documentFunctionParams }: ChatWrapperGenerateContextStateOptions): ChatWrapperGeneratedContextState;
}
