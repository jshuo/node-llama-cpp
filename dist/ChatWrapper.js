import { LlamaText, SpecialTokensText } from "./utils/LlamaText.js";
import { ChatModelFunctionsDocumentationGenerator } from "./chatWrappers/utils/ChatModelFunctionsDocumentationGenerator.js";
import { jsonDumps } from "./chatWrappers/utils/jsonDumps.js";
import { defaultChatSystemPrompt } from "./config.js";
export class ChatWrapper {
    static defaultSettings = {
        supportsSystemMessages: true,
        functions: {
            call: {
                optionalPrefixSpace: true,
                prefix: "||call: ",
                paramsPrefix: LlamaText(new SpecialTokensText("(")),
                suffix: LlamaText(new SpecialTokensText(")"))
            },
            result: {
                prefix: LlamaText(new SpecialTokensText("\n"), "||result: "),
                suffix: LlamaText(new SpecialTokensText("\n"))
            }
        }
    };
    settings = ChatWrapper.defaultSettings;
    generateContextState({ chatHistory, availableFunctions, documentFunctionParams }) {
        const historyWithFunctions = this.addAvailableFunctionsSystemMessageToHistory(chatHistory, availableFunctions, {
            documentParams: documentFunctionParams
        });
        const texts = historyWithFunctions
            .map((item) => {
            if (item.type === "system")
                return LlamaText(["system: ", LlamaText.fromJSON(item.text)]);
            else if (item.type === "user")
                return LlamaText(["user: ", item.text]);
            else if (item.type === "model")
                return LlamaText(["model: ", this.generateModelResponseText(item.response)]);
            return item;
        });
        return {
            contextText: LlamaText.joinValues("\n", texts),
            stopGenerationTriggers: []
        };
    }
    generateFunctionCallsAndResults(functionCalls, useRawCall = true) {
        const calls = [];
        const results = [];
        const res = [];
        if (functionCalls.length === 0)
            return LlamaText([]);
        for (const functionCall of functionCalls) {
            if (useRawCall && functionCall.rawCall != null)
                calls.push(LlamaText.fromJSON(functionCall.rawCall));
            else
                calls.push(this.generateFunctionCall(functionCall.name, functionCall.params));
            results.push(this.generateFunctionCallResult(functionCall.name, functionCall.params, functionCall.result));
        }
        if (this.settings.functions.parallelism == null) {
            for (let i = 0; i < calls.length; i++) {
                res.push(calls[i]);
                res.push(results[i]);
            }
            return LlamaText(res);
        }
        res.push(LlamaText(this.settings.functions.parallelism.call.sectionPrefix ?? ""));
        for (let i = 0; i < calls.length; i++) {
            if (i > 0)
                res.push(LlamaText(this.settings.functions.parallelism.call.betweenCalls ?? ""));
            res.push(calls[i]);
        }
        res.push(LlamaText(this.settings.functions.parallelism.call.sectionSuffix ?? ""));
        res.push(LlamaText(this.settings.functions.parallelism.result?.sectionPrefix ?? ""));
        for (let i = 0; i < results.length; i++) {
            if (i > 0)
                res.push(LlamaText(this.settings.functions.parallelism.result?.betweenResults ?? ""));
            res.push(results[i]);
        }
        res.push(LlamaText(this.settings.functions.parallelism.result?.sectionSuffix ?? ""));
        return LlamaText(res);
    }
    generateFunctionCall(name, params) {
        return LlamaText([
            this.settings.functions.call.prefix,
            name,
            this.settings.functions.call.paramsPrefix,
            (params === undefined
                ? ""
                : jsonDumps(params)),
            this.settings.functions.call.suffix
        ]);
    }
    generateFunctionCallResult(functionName, functionParams, result) {
        function resolveParameters(text) {
            return LlamaText(text)
                .mapValues((value) => {
                if (typeof value !== "string")
                    return value;
                return value
                    .replaceAll("{{functionName}}", functionName)
                    .replaceAll("{{functionParams}}", functionParams === undefined ? "" : jsonDumps(functionParams));
            });
        }
        return LlamaText([
            resolveParameters(this.settings.functions.result.prefix),
            (result === undefined
                ? "void"
                : jsonDumps(result)),
            resolveParameters(this.settings.functions.result.suffix)
        ]);
    }
    generateModelResponseText(modelResponse, useRawCall = true) {
        const res = [];
        const pendingFunctionCalls = [];
        const addFunctionCalls = () => {
            if (pendingFunctionCalls.length === 0)
                return;
            res.push(this.generateFunctionCallsAndResults(pendingFunctionCalls, useRawCall));
            pendingFunctionCalls.length = 0;
        };
        for (const response of modelResponse) {
            if (typeof response === "string") {
                addFunctionCalls();
                res.push(LlamaText(response));
                continue;
            }
            if (response.startsNewChunk)
                addFunctionCalls();
            pendingFunctionCalls.push(response);
        }
        addFunctionCalls();
        return LlamaText(res);
    }
    generateAvailableFunctionsSystemText(availableFunctions, { documentParams = true }) {
        const functionsDocumentationGenerator = new ChatModelFunctionsDocumentationGenerator(availableFunctions);
        if (!functionsDocumentationGenerator.hasAnyFunctions)
            return LlamaText([]);
        return LlamaText.joinValues("\n", [
            "The assistant calls the provided functions as needed to retrieve information instead of relying on existing knowledge.",
            "To fulfill a request, the assistant calls relevant functions in advance when needed before responding to the request, and does not tell the user prior to calling a function.",
            "Provided functions:",
            "```typescript",
            functionsDocumentationGenerator.getTypeScriptFunctionSignatures({ documentParams }),
            "```",
            "",
            "Calling any of the provided functions can be done like this:",
            this.generateFunctionCall("getSomeInfo", { someKey: "someValue" }),
            "",
            "Note that the || prefix is mandatory.",
            "The assistant does not inform the user about using functions and does not explain anything before calling a function.",
            "After calling a function, the raw result appears afterwards and is not part of the conversation.",
            "To make information be part of the conversation, the assistant paraphrases and repeats the information without the function syntax."
        ]);
    }
    addAvailableFunctionsSystemMessageToHistory(history, availableFunctions, { documentParams = true } = {}) {
        const availableFunctionNames = Object.keys(availableFunctions ?? {});
        if (availableFunctions == null || availableFunctionNames.length === 0)
            return history;
        const res = history.slice();
        const firstNonSystemMessageIndex = res.findIndex((item) => item.type !== "system");
        res.splice(Math.max(0, firstNonSystemMessageIndex), 0, {
            type: "system",
            text: this.generateAvailableFunctionsSystemText(availableFunctions, { documentParams }).toJSON()
        });
        return res;
    }
    generateInitialChatHistory({ systemPrompt = defaultChatSystemPrompt }) {
        return [{
                type: "system",
                text: LlamaText(systemPrompt ?? defaultChatSystemPrompt).toJSON()
            }];
    }
    /** @internal */
    static _getOptionConfigurationsToTestIfCanSupersedeJinjaTemplate() {
        return [{}];
    }
    /** @internal */ // eslint-disable-next-line @typescript-eslint/no-unused-vars
    static _checkModelCompatibility(options) {
        return true;
    }
}
//# sourceMappingURL=ChatWrapper.js.map