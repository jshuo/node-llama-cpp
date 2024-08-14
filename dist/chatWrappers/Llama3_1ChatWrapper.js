import { ChatWrapper } from "../ChatWrapper.js";
import { SpecialToken, LlamaText, SpecialTokensText } from "../utils/LlamaText.js";
import { defaultChatSystemPrompt } from "../config.js";
import { ChatModelFunctionsDocumentationGenerator } from "./utils/ChatModelFunctionsDocumentationGenerator.js";
import { jsonDumps } from "./utils/jsonDumps.js";
// source: https://llama.meta.com/docs/model-cards-and-prompt-formats/llama3_1
export class Llama3_1ChatWrapper extends ChatWrapper {
    wrapperName = "Llama 3.1";
    cuttingKnowledgeDate;
    todayDate;
    settings = {
        supportsSystemMessages: true,
        functions: {
            call: {
                optionalPrefixSpace: true,
                prefix: LlamaText(new SpecialTokensText("<function=")),
                paramsPrefix: LlamaText(new SpecialTokensText(">")),
                suffix: LlamaText(new SpecialTokensText("</function><|eom_id|>"))
            },
            result: {
                prefix: LlamaText(new SpecialTokensText("\n<|start_header_id|>ipython<|end_header_id|>\n\n")),
                suffix: LlamaText(new SpecialToken("EOT"), new SpecialTokensText("<|start_header_id|>assistant<|end_header_id|>\n\n"))
            }
        }
    };
    /**
     * @param options
     */
    constructor({ cuttingKnowledgeDate = new Date("2023-12-01T00:00:00Z"), todayDate = new Date() } = {}) {
        super();
        this.cuttingKnowledgeDate = cuttingKnowledgeDate == null
            ? null
            : new Date(cuttingKnowledgeDate);
        this.todayDate = todayDate == null
            ? null
            : new Date(todayDate);
    }
    addAvailableFunctionsSystemMessageToHistory(history, availableFunctions, { documentParams = true } = {}) {
        const availableFunctionNames = Object.keys(availableFunctions ?? {});
        if (availableFunctions == null || availableFunctionNames.length === 0)
            return history;
        const res = history.slice();
        const functionsSystemMessage = {
            type: "system",
            text: this.generateAvailableFunctionsSystemText(availableFunctions, { documentParams }).toJSON()
        };
        if (res.length >= 2 && res[0].type === "system" && res[1].type === "system")
            res.splice(1, 0, functionsSystemMessage);
        else
            res.unshift({
                type: "system",
                text: this.generateAvailableFunctionsSystemText(availableFunctions, { documentParams }).toJSON()
            });
        return res;
    }
    generateContextState({ chatHistory, availableFunctions, documentFunctionParams }) {
        const historyWithFunctions = this.addAvailableFunctionsSystemMessageToHistory(chatHistory, availableFunctions, {
            documentParams: documentFunctionParams
        });
        const resultItems = [];
        let systemTexts = [];
        let userTexts = [];
        let modelTexts = [];
        let currentAggregateFocus = null;
        function flush() {
            if (systemTexts.length > 0 || userTexts.length > 0 || modelTexts.length > 0)
                resultItems.push({
                    system: systemTexts.length === 0
                        ? null
                        : LlamaText.joinValues("\n\n", systemTexts),
                    user: userTexts.length === 0
                        ? null
                        : LlamaText.joinValues("\n\n", userTexts),
                    model: modelTexts.length === 0
                        ? null
                        : LlamaText.joinValues("\n\n", modelTexts)
                });
            systemTexts = [];
            userTexts = [];
            modelTexts = [];
        }
        for (const item of historyWithFunctions) {
            if (item.type === "system") {
                if (currentAggregateFocus !== "system")
                    flush();
                currentAggregateFocus = "system";
                systemTexts.push(LlamaText.fromJSON(item.text));
            }
            else if (item.type === "user") {
                if (currentAggregateFocus !== "user")
                    flush();
                currentAggregateFocus = "user";
                userTexts.push(LlamaText(item.text));
            }
            else if (item.type === "model") {
                if (currentAggregateFocus !== "model")
                    flush();
                currentAggregateFocus = "model";
                modelTexts.push(this.generateModelResponseText(item.response));
            }
            else
                void item;
        }
        flush();
        const contextText = LlamaText(new SpecialToken("BOS"), resultItems.map((item, index) => {
            const isLastItem = index === resultItems.length - 1;
            const res = [];
            if (item.system != null) {
                res.push(LlamaText([
                    new SpecialTokensText("<|start_header_id|>system<|end_header_id|>\n\n"),
                    item.system,
                    new SpecialToken("EOT")
                ]));
            }
            if (item.user != null) {
                res.push(LlamaText([
                    new SpecialTokensText("<|start_header_id|>user<|end_header_id|>\n\n"),
                    item.user,
                    new SpecialToken("EOT")
                ]));
            }
            if (item.model != null) {
                res.push(LlamaText([
                    new SpecialTokensText("<|start_header_id|>assistant<|end_header_id|>\n\n"),
                    item.model,
                    isLastItem
                        ? LlamaText([])
                        : new SpecialToken("EOT")
                ]));
            }
            return LlamaText(res);
        }));
        return {
            contextText,
            stopGenerationTriggers: [
                LlamaText(new SpecialToken("EOS")),
                LlamaText(new SpecialToken("EOT")),
                LlamaText(new SpecialTokensText("<|eot_id|>")),
                LlamaText(new SpecialTokensText("<|end_of_text|>")),
                LlamaText("<|eot_id|>"),
                LlamaText("<|end_of_text|>")
            ]
        };
    }
    generateAvailableFunctionsSystemText(availableFunctions, { documentParams = true }) {
        const functionsDocumentationGenerator = new ChatModelFunctionsDocumentationGenerator(availableFunctions);
        if (!functionsDocumentationGenerator.hasAnyFunctions)
            return LlamaText([]);
        return LlamaText.joinValues("\n", [
            "You have access to the following functions:",
            "",
            functionsDocumentationGenerator.getLlama3_1FunctionSignatures({ documentParams }),
            "",
            "",
            "If you choose to call a function ONLY reply in the following format:",
            "<{start_tag}={function_name}>{parameters}{end_tag}",
            "where",
            "",
            "start_tag => `<function`",
            "parameters => a JSON dict with the function argument name as key and function argument value as value.",
            "end_tag => `</function>`",
            "",
            "Here is an example,",
            LlamaText([
                new SpecialTokensText("<function="),
                "example_function_name",
                new SpecialTokensText(">"),
                jsonDumps({ "example_name": "example_value" }),
                new SpecialTokensText("</function>")
            ]),
            "",
            "Reminder:",
            "- Function calls MUST follow the specified format",
            "- Only call one function at a time",
            "- Put the entire function call reply on one line",
            "- Always add your sources when using search results to answer the user query"
        ]);
    }
    generateInitialChatHistory({ systemPrompt = defaultChatSystemPrompt }) {
        const res = [];
        function formatDate(date) {
            const day = date.toLocaleDateString("en-US", { day: "numeric", timeZone: "UTC" });
            const month = date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
            const year = date.toLocaleDateString("en-US", { year: "numeric", timeZone: "UTC" });
            return `${day} ${month} ${year}`;
        }
        const formatMonthDate = (date) => {
            const today = this.todayDate ?? new Date();
            if (today.getUTCMonth() === date.getUTCMonth() && today.getUTCFullYear() === date.getUTCFullYear())
                return formatDate(date);
            const month = date.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
            const year = date.toLocaleDateString("en-US", { year: "numeric", timeZone: "UTC" });
            return `${month} ${year}`;
        };
        const lines = [];
        if (this.cuttingKnowledgeDate != null)
            lines.push(`Cutting Knowledge Date: ${formatMonthDate(this.cuttingKnowledgeDate)}`);
        if (this.todayDate != null)
            lines.push(`Today Date: ${formatDate(this.todayDate)}`);
        lines.push("");
        lines.push("# Tool Instructions");
        lines.push("- When looking for real time information use relevant functions if available");
        lines.push("");
        lines.push("");
        res.push({
            type: "system",
            text: LlamaText.joinValues("\n", lines).toJSON()
        }, {
            type: "system",
            text: LlamaText(systemPrompt ?? defaultChatSystemPrompt).toJSON()
        });
        return res;
    }
    /** @internal */
    static _checkModelCompatibility(options) {
        if (options.tokenizer != null) {
            const tokens = options.tokenizer("<|eom_id|>", true, "trimLeadingSpace");
            return tokens.length === 1 && options.tokenizer.isSpecialToken(tokens[0]);
        }
        return true;
    }
}
//# sourceMappingURL=Llama3_1ChatWrapper.js.map