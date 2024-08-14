import { Template } from "@huggingface/jinja";
import { splitText } from "lifecycle-utils";
import { SpecialToken, LlamaText, SpecialTokensText } from "../../utils/LlamaText.js";
import { ChatWrapper } from "../../ChatWrapper.js";
import { parseFunctionCallMessageTemplate } from "./utils/chatHistoryFunctionCallMessageTemplate.js";
const defaultConvertUnsupportedSystemMessagesToUserMessagesFormat = {
    format: "### System message\n\n{{message}}\n\n----"
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
export class JinjaTemplateChatWrapper extends ChatWrapper {
    wrapperName = "JinjaTemplate";
    settings;
    template;
    modelRoleName;
    userRoleName;
    systemRoleName;
    convertUnsupportedSystemMessagesToUserMessages;
    joinAdjacentMessagesOfTheSameType;
    trimLeadingWhitespaceInResponses;
    /** @internal */ _jinjaTemplate;
    constructor({ template, modelRoleName = "assistant", userRoleName = "user", systemRoleName = "system", convertUnsupportedSystemMessagesToUserMessages = defaultConvertUnsupportedSystemMessagesToUserMessagesFormat, functionCallMessageTemplate, joinAdjacentMessagesOfTheSameType = true, trimLeadingWhitespaceInResponses = true }) {
        super();
        if (template == null)
            throw new Error("template cannot be null");
        this.template = template;
        this.modelRoleName = modelRoleName;
        this.userRoleName = userRoleName;
        this.systemRoleName = systemRoleName;
        this.convertUnsupportedSystemMessagesToUserMessages =
            resolveConvertUnsupportedSystemMessagesToUserMessagesOption(convertUnsupportedSystemMessagesToUserMessages);
        this.joinAdjacentMessagesOfTheSameType = joinAdjacentMessagesOfTheSameType;
        this.trimLeadingWhitespaceInResponses = trimLeadingWhitespaceInResponses;
        this.settings = {
            ...ChatWrapper.defaultSettings,
            functions: parseFunctionCallMessageTemplate(functionCallMessageTemplate) ?? ChatWrapper.defaultSettings.functions
        };
        if (this.convertUnsupportedSystemMessagesToUserMessages != null && !this.convertUnsupportedSystemMessagesToUserMessages.format.includes("{{message}}"))
            throw new Error('convertUnsupportedSystemMessagesToUserMessages format must include "{{message}}"');
        this._jinjaTemplate = new Template(this.template);
        const { supportsSystemMessages } = this._runSanityTest();
        this.settings = {
            ...this.settings,
            supportsSystemMessages
        };
    }
    generateContextState({ chatHistory, availableFunctions, documentFunctionParams }) {
        const historyWithFunctions = this.addAvailableFunctionsSystemMessageToHistory(chatHistory, availableFunctions, {
            documentParams: documentFunctionParams
        });
        if (this.convertUnsupportedSystemMessagesToUserMessages == null) {
            return this._generateContextText(historyWithFunctions, {
                convertSystemMessagesToUserMessagesFormat: undefined
            });
        }
        else if (this.convertUnsupportedSystemMessagesToUserMessages.use === "always") {
            return this._generateContextText(historyWithFunctions, {
                convertSystemMessagesToUserMessagesFormat: this.convertUnsupportedSystemMessagesToUserMessages.format
            });
        }
        try {
            return this._generateContextText(historyWithFunctions, {
                convertSystemMessagesToUserMessagesFormat: undefined
            });
        }
        catch (error) {
            return this._generateContextText(historyWithFunctions, {
                convertSystemMessagesToUserMessagesFormat: this.convertUnsupportedSystemMessagesToUserMessages.format
            });
        }
    }
    /** @internal */
    _generateContextText(history, { convertSystemMessagesToUserMessagesFormat }) {
        let transformedSystemMessagesToUserMessages = false;
        const transformedHistory = convertSystemMessagesToUserMessagesFormat == null
            ? history
            : history.map((item) => {
                if (item.type === "system") {
                    transformedSystemMessagesToUserMessages = true;
                    return {
                        type: "user",
                        text: LlamaText.joinValues(LlamaText.fromJSON(item.text), convertSystemMessagesToUserMessagesFormat.split("{{message}}")).toString()
                    };
                }
                return item;
            });
        const resultItems = [];
        const currentTexts = [];
        let currentAggregateFocus = null;
        function flush() {
            if (currentTexts.length > 0 && currentAggregateFocus != null)
                resultItems.push({ role: currentAggregateFocus, content: LlamaText.joinValues("\n\n", currentTexts) });
            currentTexts.length = 0;
        }
        for (const item of transformedHistory) {
            if (item.type === "system") {
                if (!this.joinAdjacentMessagesOfTheSameType || currentAggregateFocus !== "system")
                    flush();
                currentAggregateFocus = "system";
                currentTexts.push(LlamaText.fromJSON(item.text));
            }
            else if (item.type === "user") {
                if (!this.joinAdjacentMessagesOfTheSameType || currentAggregateFocus !== "user")
                    flush();
                currentAggregateFocus = "user";
                currentTexts.push(LlamaText(item.text));
            }
            else if (item.type === "model") {
                if (!this.joinAdjacentMessagesOfTheSameType || currentAggregateFocus !== "model")
                    flush();
                currentAggregateFocus = "model";
                currentTexts.push(this.generateModelResponseText(item.response));
            }
            else
                void item;
        }
        const lastItemIsModelMessage = currentAggregateFocus === "model";
        flush();
        const idsGenerator = new UniqueTemplateId(this.template + this.modelRoleName + this.userRoleName + this.systemRoleName +
            (convertSystemMessagesToUserMessagesFormat ?? "") + resultItems.map(({ content }) => content.toString()).join("\n\n"));
        const jinjaItems = [];
        const jinjaRoleMap = {
            system: this.systemRoleName,
            user: this.userRoleName,
            model: this.modelRoleName
        };
        const idToContent = new Map();
        const modelMessageIds = new Set();
        const messageIds = new Set();
        for (const resultItem of resultItems) {
            const id = idsGenerator.generateId();
            messageIds.add(id);
            idToContent.set(id, resultItem.content);
            jinjaItems.push({
                role: jinjaRoleMap[resultItem.role],
                content: id
            });
            if (resultItem.role === "model")
                modelMessageIds.add(id);
        }
        const bosTokenId = idsGenerator.generateId();
        const eosTokenId = idsGenerator.generateId();
        const eotTokenId = idsGenerator.generateId();
        idToContent.set(bosTokenId, new SpecialToken("BOS"));
        idToContent.set(eosTokenId, new SpecialToken("EOS"));
        idToContent.set(eotTokenId, new SpecialToken("EOT"));
        const renderJinjaText = () => {
            try {
                return this._jinjaTemplate.render({
                    messages: jinjaItems,
                    "bos_token": bosTokenId,
                    "eos_token": eosTokenId,
                    "eot_token": eotTokenId
                });
            }
            catch (err) {
                return this._jinjaTemplate.render({
                    messages: jinjaItems,
                    "bos_token": bosTokenId,
                    "eos_token": eosTokenId,
                    "eot_token": eotTokenId,
                    "add_generation_prompt": true
                });
            }
        };
        const validateThatAllMessageIdsAreUsed = (parts) => {
            const messageIdsLeft = new Set(messageIds);
            for (const part of parts) {
                if (typeof part === "string")
                    continue;
                messageIdsLeft.delete(part.separator);
            }
            if (messageIdsLeft.size !== 0)
                throw new Error("Some input messages are not present in the generated Jinja template output");
        };
        const renderJinjaAndSplitIntoParts = () => {
            const splitJinjaParts = splitText(renderJinjaText(), [...idToContent.keys()]);
            if (lastItemIsModelMessage) {
                let lastModelResponseIndex = -1;
                for (let i = splitJinjaParts.length - 1; i >= 0; i--) {
                    const part = splitJinjaParts[i];
                    if (typeof part === "string")
                        continue;
                    if (modelMessageIds.has(part.separator)) {
                        lastModelResponseIndex = i;
                        break;
                    }
                    else if (messageIds.has(part.separator)) {
                        validateThatAllMessageIdsAreUsed(splitJinjaParts);
                        throw new Error("Last message was expected to be a model message, but it was not");
                    }
                }
                if (lastModelResponseIndex < 0) {
                    validateThatAllMessageIdsAreUsed(splitJinjaParts);
                    throw new Error("A model message was expected to be the last message, but it was not found");
                }
                return {
                    splitJinjaParts: splitJinjaParts.slice(0, lastModelResponseIndex + 1),
                    stopGenerationJinjaParts: splitJinjaParts.slice(lastModelResponseIndex + 1)
                };
            }
            return {
                splitJinjaParts,
                stopGenerationJinjaParts: []
            };
        };
        const { splitJinjaParts, stopGenerationJinjaParts } = renderJinjaAndSplitIntoParts();
        const messageIdsLeftToProcess = new Set(messageIds);
        const contextText = LlamaText(splitJinjaParts.map((part) => {
            if (typeof part === "string")
                return new SpecialTokensText(part); // things that are not message content can be tokenized with special tokens
            const message = idToContent.get(part.separator);
            if (message == null)
                throw new Error(`Message with id "${part.separator}" not found`);
            messageIdsLeftToProcess.delete(part.separator);
            return message;
        }));
        if (messageIdsLeftToProcess.size !== 0)
            throw new Error("Some input messages are not present in the generated Jinja template output");
        return {
            contextText,
            ignoreStartText: !this.trimLeadingWhitespaceInResponses
                ? []
                : [
                    // ignore up to 4 leading spaces
                    ...Array(4).fill(0)
                        .map((_, index) => LlamaText(" ".repeat(index + 1))),
                    LlamaText("\t"),
                    LlamaText("\t\t"),
                    LlamaText("\t "),
                    LlamaText(" \t")
                ],
            stopGenerationTriggers: [
                LlamaText(new SpecialToken("EOS")),
                ...(stopGenerationJinjaParts.length === 0
                    ? []
                    : [
                        LlamaText(stopGenerationJinjaParts.map((part) => {
                            if (typeof part === "string")
                                return new SpecialTokensText(part);
                            const message = idToContent.get(part.separator);
                            if (message == null)
                                throw new Error(`Message with id "${part.separator}" not found`);
                            return message;
                        }))
                    ])
            ],
            transformedSystemMessagesToUserMessages
        };
    }
    /**
     * Validate that this Jinja template can be rendered
     * @internal
     */
    _runSanityTest() {
        try {
            let supportsSystemMessages = true;
            for (const chatHistory of chatHistoriesForSanityTest) {
                const { transformedSystemMessagesToUserMessages } = this.generateContextState({ chatHistory });
                if (transformedSystemMessagesToUserMessages)
                    supportsSystemMessages = false;
            }
            return { supportsSystemMessages };
        }
        catch (err) {
            throw new Error("The provided Jinja template failed that sanity test: " + String(err));
        }
    }
}
class UniqueTemplateId {
    antiText;
    _ids = new Set();
    constructor(antiText) {
        this.antiText = antiText;
    }
    generateId() {
        let id;
        do {
            id = "W" + (Math.random()
                .toString(36)
                .slice(2)) + "W";
        } while (this._ids.has(id) || this.antiText.includes(id));
        this._ids.add(id);
        return id;
    }
    removeId(id) {
        this._ids.delete(id);
    }
}
function resolveConvertUnsupportedSystemMessagesToUserMessagesOption(convertUnsupportedSystemMessagesToUserMessages) {
    if (convertUnsupportedSystemMessagesToUserMessages === false)
        return undefined;
    if (convertUnsupportedSystemMessagesToUserMessages === true)
        return {
            ...defaultConvertUnsupportedSystemMessagesToUserMessagesFormat,
            use: "always"
        };
    if (convertUnsupportedSystemMessagesToUserMessages === "auto")
        return {
            ...defaultConvertUnsupportedSystemMessagesToUserMessagesFormat,
            use: "ifNeeded"
        };
    if (typeof convertUnsupportedSystemMessagesToUserMessages === "object")
        return {
            ...convertUnsupportedSystemMessagesToUserMessages,
            use: convertUnsupportedSystemMessagesToUserMessages.use ?? "ifNeeded"
        };
    return { ...defaultConvertUnsupportedSystemMessagesToUserMessagesFormat, use: "ifNeeded" };
}
const chatHistoriesForSanityTest = [
    [{
            type: "system",
            text: "System message ~!@#$%^&*()\n*"
        }, {
            type: "user",
            text: "Message 1234567890!@#$%^&*()_+-=[]{}|\\:;\"',./<>?`~"
        }, {
            type: "model",
            response: [""]
        }],
    [{
            type: "system",
            text: "System message ~!@#$%^&*()\n*"
        }, {
            type: "user",
            text: "Message 1234567890!@#$%^&*()_+-=[]{}|\\:;\"',./<>?`~"
        }, {
            type: "model",
            response: ["Result 1234567890!@#$%^&*()_+-=[]{}|\\:;\"',./<>?`~"]
        }],
    [{
            type: "system",
            text: "System message ~!@#$%^&*()\n*"
        }, {
            type: "user",
            text: "Message 1234567890!@#$%^&*()_+-=[]{}|\\:;\"',./<>?`~"
        }, {
            type: "model",
            response: ["Result 1234567890!@#$%^&*()_+-=[]{}|\\:;\"',./<>?`~"]
        }, {
            type: "user",
            text: "Message2 1234567890!@#$%^&*()_+-=[]{}|\\:;\"',./<>?`~"
        }, {
            type: "model",
            response: [""]
        }],
    [{
            type: "system",
            text: "System message ~!@#$%^&*()\n*"
        }, {
            type: "user",
            text: "Message 1234567890!@#$%^&*()_+-=[]{}|\\:;\"',./<>?`~"
        }, {
            type: "model",
            response: ["Result 1234567890!@#$%^&*()_+-=[]{}|\\:;\"',./<>?`~"]
        }, {
            type: "user",
            text: "Message2 1234567890!@#$%^&*()_+-=[]{}|\\:;\"',./<>?`~"
        }, {
            type: "model",
            response: ["Result2 1234567890!@#$%^&*()_+-=[]{}|\\:;\"',./<>?`~"]
        }]
];
//# sourceMappingURL=JinjaTemplateChatWrapper.js.map