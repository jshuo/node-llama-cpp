import { SpecialToken, LlamaText, SpecialTokensText } from "../../utils/LlamaText.js";
import { ChatWrapper } from "../../ChatWrapper.js";
import { parseTextTemplate } from "../../utils/parseTextTemplate.js";
import { parseFunctionCallMessageTemplate } from "./utils/chatHistoryFunctionCallMessageTemplate.js";
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
export class TemplateChatWrapper extends ChatWrapper {
    wrapperName = "Template";
    settings;
    template;
    historyTemplate;
    modelRoleName;
    userRoleName;
    systemRoleName;
    joinAdjacentMessagesOfTheSameType;
    /** @internal */ _parsedChatTemplate;
    /** @internal */ _parsedChatHistoryTemplate;
    constructor({ template, historyTemplate, modelRoleName, userRoleName, systemRoleName = "System", functionCallMessageTemplate, joinAdjacentMessagesOfTheSameType = true }) {
        super();
        if (template == null || historyTemplate == null || modelRoleName == null || userRoleName == null)
            throw new Error("Template chat wrapper settings must have a template, historyTemplate, modelRoleName, and userRoleName.");
        this.template = template;
        this.historyTemplate = historyTemplate;
        this.modelRoleName = modelRoleName;
        this.userRoleName = userRoleName;
        this.systemRoleName = systemRoleName;
        this.joinAdjacentMessagesOfTheSameType = joinAdjacentMessagesOfTheSameType;
        this._parsedChatTemplate = parseChatTemplate(template);
        this._parsedChatHistoryTemplate = parseChatHistoryTemplate(historyTemplate);
        this.settings = {
            ...ChatWrapper.defaultSettings,
            functions: parseFunctionCallMessageTemplate(functionCallMessageTemplate) ?? ChatWrapper.defaultSettings.functions
        };
    }
    generateContextState({ chatHistory, availableFunctions, documentFunctionParams }) {
        const historyWithFunctions = this.addAvailableFunctionsSystemMessageToHistory(chatHistory, availableFunctions, {
            documentParams: documentFunctionParams
        });
        const resultItems = [];
        const systemTexts = [];
        const userTexts = [];
        const modelTexts = [];
        let currentAggregateFocus = null;
        function flush() {
            if (systemTexts.length > 0 || userTexts.length > 0 || modelTexts.length > 0)
                resultItems.push({
                    system: LlamaText.joinValues("\n\n", systemTexts),
                    user: LlamaText.joinValues("\n\n", userTexts),
                    model: LlamaText.joinValues("\n\n", modelTexts)
                });
            systemTexts.length = 0;
            userTexts.length = 0;
            modelTexts.length = 0;
        }
        for (const item of historyWithFunctions) {
            if (item.type === "system") {
                if (!this.joinAdjacentMessagesOfTheSameType || currentAggregateFocus !== "system")
                    flush();
                currentAggregateFocus = "system";
                systemTexts.push(LlamaText.fromJSON(item.text));
            }
            else if (item.type === "user") {
                if (!this.joinAdjacentMessagesOfTheSameType || (currentAggregateFocus !== "system" && currentAggregateFocus !== "user"))
                    flush();
                currentAggregateFocus = "user";
                userTexts.push(LlamaText(item.text));
            }
            else if (item.type === "model") {
                if (!this.joinAdjacentMessagesOfTheSameType)
                    flush();
                currentAggregateFocus = "model";
                modelTexts.push(this.generateModelResponseText(item.response));
            }
            else
                void item;
        }
        flush();
        const getHistoryItem = (role, text, prefix) => {
            const { roleNamePrefix, messagePrefix, messageSuffix } = this._parsedChatHistoryTemplate;
            return LlamaText([
                new SpecialTokensText((prefix ?? "") + roleNamePrefix + role + messagePrefix),
                text,
                new SpecialTokensText(messageSuffix)
            ]);
        };
        const contextText = LlamaText(resultItems.map(({ system, user, model }, index) => {
            const isFirstItem = index === 0;
            const isLastItem = index === resultItems.length - 1;
            const res = LlamaText([
                isFirstItem
                    ? system.values.length === 0
                        ? new SpecialTokensText((this._parsedChatTemplate.systemPromptPrefix ?? "") + this._parsedChatTemplate.historyPrefix)
                        : this._parsedChatTemplate.systemPromptPrefix != null
                            ? LlamaText([
                                new SpecialTokensText(this._parsedChatTemplate.systemPromptPrefix),
                                system,
                                new SpecialTokensText(this._parsedChatTemplate.historyPrefix)
                            ])
                            : getHistoryItem("system", system, this._parsedChatTemplate.historyPrefix)
                    : system.values.length === 0
                        ? LlamaText([])
                        : getHistoryItem("system", system),
                user.values.length === 0
                    ? LlamaText([])
                    : getHistoryItem("user", user),
                model.values.length === 0
                    ? LlamaText([])
                    : !isLastItem
                        ? getHistoryItem("model", model)
                        : LlamaText([
                            new SpecialTokensText(this._parsedChatTemplate.completionPrefix),
                            model
                        ])
            ]);
            return LlamaText(res.values.reduce((res, value) => {
                if (value instanceof SpecialTokensText) {
                    const lastItem = res[res.length - 1];
                    if (lastItem == null || !(lastItem instanceof SpecialTokensText))
                        return res.concat([value]);
                    return res.slice(0, -1).concat([
                        new SpecialTokensText(lastItem.value + value.value)
                    ]);
                }
                return res.concat([value]);
            }, []));
        }));
        return {
            contextText,
            stopGenerationTriggers: [
                LlamaText(new SpecialToken("EOS")),
                LlamaText(this._parsedChatTemplate.completionSuffix),
                LlamaText(new SpecialTokensText(this._parsedChatTemplate.completionSuffix))
            ]
        };
    }
}
function parseChatTemplate(template) {
    const parsedTemplate = parseTextTemplate(template, [{
            text: "{{systemPrompt}}",
            key: "systemPrompt",
            optional: true
        }, {
            text: "{{history}}",
            key: "history"
        }, {
            text: "{{completion}}",
            key: "completion"
        }]);
    if (parsedTemplate.completion.suffix.length == 0)
        throw new Error('Chat template must have text after "{{completion}}"');
    return {
        systemPromptPrefix: parsedTemplate.systemPrompt?.prefix ?? null,
        historyPrefix: parsedTemplate.history.prefix,
        completionPrefix: parsedTemplate.completion.prefix,
        completionSuffix: parsedTemplate.completion.suffix
    };
}
function parseChatHistoryTemplate(template) {
    const parsedTemplate = parseTextTemplate(template, [{
            text: "{{roleName}}",
            key: "roleName"
        }, {
            text: "{{message}}",
            key: "message"
        }]);
    return {
        roleNamePrefix: parsedTemplate.roleName.prefix,
        messagePrefix: parsedTemplate.message.prefix,
        messageSuffix: parsedTemplate.message.suffix
    };
}
//# sourceMappingURL=TemplateChatWrapper.js.map