import { parseModelFileName } from "../../utils/parseModelFileName.js";
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
import { getConsoleLogPrefix } from "../../utils/getConsoleLogPrefix.js";
import { Llama3_1ChatWrapper } from "../Llama3_1ChatWrapper.js";
import { isJinjaTemplateEquivalentToSpecializedChatWrapper } from "./isJinjaTemplateEquivalentToSpecializedChatWrapper.js";
export const specializedChatWrapperTypeNames = Object.freeze([
    "general", "llama3.1", "llama3", "llama2Chat", "alpacaChat", "functionary", "chatML", "falconChat", "gemma"
]);
export const templateChatWrapperTypeNames = Object.freeze([
    "template", "jinjaTemplate"
]);
export const resolvableChatWrapperTypeNames = Object.freeze([
    "auto",
    ...specializedChatWrapperTypeNames,
    ...templateChatWrapperTypeNames
]);
const chatWrappers = {
    "general": GeneralChatWrapper,
    "llama3.1": Llama3_1ChatWrapper,
    "llama3": Llama3ChatWrapper,
    "llama2Chat": Llama2ChatWrapper,
    "alpacaChat": AlpacaChatWrapper,
    "functionary": FunctionaryChatWrapper,
    "chatML": ChatMLChatWrapper,
    "falconChat": FalconChatWrapper,
    "gemma": GemmaChatWrapper,
    "template": TemplateChatWrapper,
    "jinjaTemplate": JinjaTemplateChatWrapper
};
const chatWrapperToConfigType = new Map(Object.entries(chatWrappers)
    .map(([configType, Wrapper]) => ([Wrapper, configType])));
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
export function resolveChatWrapper({ type = "auto", bosString, filename, fileInfo, tokenizer, customWrapperSettings, warningLogs = true, fallbackToOtherWrappersOnJinjaError = true, noJinja = false }) {
    function createSpecializedChatWrapper(specializedChatWrapper, defaultSettings = {}) {
        const chatWrapperConfigType = chatWrapperToConfigType.get(specializedChatWrapper);
        const chatWrapperSettings = customWrapperSettings?.[chatWrapperConfigType];
        return new specializedChatWrapper({
            ...(defaultSettings ?? {}),
            ...(chatWrapperSettings ?? {})
        });
    }
    function getModelLinageNames() {
        const res = [];
        if (fileInfo == null)
            return res;
        const currentModelInfo = [fileInfo.metadata?.general?.name, fileInfo.metadata?.general?.basename]
            .filter((v) => v != null);
        if (currentModelInfo.length > 0)
            res.push(currentModelInfo);
        if (typeof fileInfo.metadata?.general?.base_model?.count === "number") {
            for (let i = 0; i < fileInfo.metadata.general.base_model.count; i++) {
                const baseModel = fileInfo.metadata.general.base_model[String(i)];
                if (baseModel?.name != null)
                    res.push([baseModel.name]);
            }
        }
        return res;
    }
    if (type !== "auto" && type != null) {
        if (isTemplateChatWrapperType(type)) {
            const Wrapper = chatWrappers[type];
            if (isClassReference(Wrapper, TemplateChatWrapper)) {
                const wrapperSettings = customWrapperSettings?.template;
                if (wrapperSettings == null || wrapperSettings?.template == null || wrapperSettings?.historyTemplate == null ||
                    wrapperSettings?.modelRoleName == null || wrapperSettings?.userRoleName == null) {
                    if (warningLogs)
                        console.warn(getConsoleLogPrefix() + "Template chat wrapper settings must have a template, historyTemplate, modelRoleName, and userRoleName. Falling back to resolve other chat wrapper types.");
                }
                else
                    return new TemplateChatWrapper(wrapperSettings);
            }
            else if (isClassReference(Wrapper, JinjaTemplateChatWrapper)) {
                const jinjaTemplate = customWrapperSettings?.jinjaTemplate?.template ?? fileInfo?.metadata?.tokenizer?.chat_template;
                if (jinjaTemplate == null) {
                    if (warningLogs)
                        console.warn(getConsoleLogPrefix() + "Jinja template chat wrapper received no template. Falling back to resolve other chat wrapper types.");
                }
                else {
                    try {
                        return new JinjaTemplateChatWrapper({
                            ...(customWrapperSettings?.jinjaTemplate ?? {}),
                            template: jinjaTemplate
                        });
                    }
                    catch (err) {
                        if (!fallbackToOtherWrappersOnJinjaError)
                            throw err;
                        else if (warningLogs)
                            console.error(getConsoleLogPrefix() + "Error creating Jinja template chat wrapper. Falling back to resolve other chat wrappers. Error:", err);
                    }
                }
            }
            else
                void Wrapper;
        }
        else if (Object.hasOwn(chatWrappers, type)) {
            const Wrapper = chatWrappers[type];
            const wrapperSettings = customWrapperSettings?.[type];
            return new Wrapper(wrapperSettings);
        }
    }
    const modelJinjaTemplate = customWrapperSettings?.jinjaTemplate?.template ?? fileInfo?.metadata?.tokenizer?.chat_template;
    if (modelJinjaTemplate != null && modelJinjaTemplate.trim() !== "") {
        const jinjaTemplateChatWrapperOptions = {
            ...(customWrapperSettings?.jinjaTemplate ?? {}),
            template: modelJinjaTemplate
        };
        const chatWrapperNamesToCheck = orderChatWrapperNamesByAssumedCompatibilityWithModel(specializedChatWrapperTypeNames, { filename, fileInfo });
        for (const specializedChatWrapperTypeName of chatWrapperNamesToCheck) {
            const Wrapper = chatWrappers[specializedChatWrapperTypeName];
            const wrapperSettings = customWrapperSettings?.[specializedChatWrapperTypeName];
            const isCompatible = Wrapper._checkModelCompatibility({
                tokenizer,
                fileInfo
            });
            if (!isCompatible)
                continue;
            const testOptionConfigurations = Wrapper._getOptionConfigurationsToTestIfCanSupersedeJinjaTemplate?.() ?? [];
            if (testOptionConfigurations.length === 0)
                testOptionConfigurations.push({});
            for (const testConfiguration of testOptionConfigurations) {
                const testChatWrapperSettings = {
                    ...(wrapperSettings ?? {}),
                    ...(testConfiguration ?? {})
                };
                const chatWrapper = new Wrapper(testChatWrapperSettings);
                if (isJinjaTemplateEquivalentToSpecializedChatWrapper(jinjaTemplateChatWrapperOptions, chatWrapper, tokenizer))
                    return new Wrapper(testChatWrapperSettings);
            }
        }
        if (!noJinja) {
            if (!fallbackToOtherWrappersOnJinjaError)
                return new JinjaTemplateChatWrapper(jinjaTemplateChatWrapperOptions);
            try {
                return new JinjaTemplateChatWrapper(jinjaTemplateChatWrapperOptions);
            }
            catch (err) {
                console.error(getConsoleLogPrefix() + "Error creating Jinja template chat wrapper. Falling back to resolve other chat wrappers. Error:", err);
            }
        }
    }
    // try to find a pattern in the Jinja template to resolve to a specialized chat wrapper,
    // with a logic similar to `llama.cpp`'s `llama_chat_apply_template_internal` function
    if (modelJinjaTemplate != null && modelJinjaTemplate.trim() !== "") {
        if (modelJinjaTemplate.includes("<|im_start|>"))
            return createSpecializedChatWrapper(ChatMLChatWrapper);
        else if (modelJinjaTemplate.includes("[INST]"))
            return createSpecializedChatWrapper(Llama2ChatWrapper, {
                addSpaceBeforeEos: modelJinjaTemplate.includes("' ' + eos_token")
            });
        else if (modelJinjaTemplate.includes("<|start_header_id|>") && modelJinjaTemplate.includes("<|end_header_id|>")) {
            if (Llama3_1ChatWrapper._checkModelCompatibility({ tokenizer, fileInfo }))
                return createSpecializedChatWrapper(Llama3_1ChatWrapper);
            else
                return createSpecializedChatWrapper(Llama3ChatWrapper);
        }
        else if (modelJinjaTemplate.includes("<start_of_turn>"))
            return createSpecializedChatWrapper(GemmaChatWrapper);
    }
    for (const modelNames of getModelLinageNames()) {
        if (includesText(modelNames, ["llama 3.1", "llama-3.1", "llama3.1"]) && Llama3_1ChatWrapper._checkModelCompatibility({ tokenizer, fileInfo }))
            return createSpecializedChatWrapper(Llama3_1ChatWrapper);
        else if (includesText(modelNames, ["llama 3", "llama-3", "llama3"]))
            return createSpecializedChatWrapper(Llama3ChatWrapper);
    }
    if (filename != null) {
        const { name, subType, fileType, otherInfo } = parseModelFileName(filename);
        if (fileType?.toLowerCase() === "gguf") {
            const lowercaseName = name?.toLowerCase();
            const lowercaseSubType = subType?.toLowerCase();
            const splitLowercaseSubType = (lowercaseSubType?.split("-") ?? []).concat(otherInfo.map(info => info.toLowerCase()));
            const firstSplitLowercaseSubType = splitLowercaseSubType[0];
            if (lowercaseName === "llama") {
                if (splitLowercaseSubType.includes("chat"))
                    return createSpecializedChatWrapper(Llama2ChatWrapper);
                return createSpecializedChatWrapper(GeneralChatWrapper);
            }
            else if (lowercaseName === "codellama")
                return createSpecializedChatWrapper(GeneralChatWrapper);
            else if (lowercaseName === "yarn" && firstSplitLowercaseSubType === "llama")
                return createSpecializedChatWrapper(Llama2ChatWrapper);
            else if (lowercaseName === "orca")
                return createSpecializedChatWrapper(ChatMLChatWrapper);
            else if (lowercaseName === "phind" && lowercaseSubType === "codellama")
                return createSpecializedChatWrapper(Llama2ChatWrapper);
            else if (lowercaseName === "mistral")
                return createSpecializedChatWrapper(GeneralChatWrapper);
            else if (firstSplitLowercaseSubType === "llama")
                return createSpecializedChatWrapper(Llama2ChatWrapper);
            else if (lowercaseSubType === "alpaca")
                return createSpecializedChatWrapper(AlpacaChatWrapper);
            else if (lowercaseName === "functionary")
                return createSpecializedChatWrapper(FunctionaryChatWrapper);
            else if (lowercaseName === "dolphin" && splitLowercaseSubType.includes("mistral"))
                return createSpecializedChatWrapper(ChatMLChatWrapper);
            else if (lowercaseName === "gemma")
                return createSpecializedChatWrapper(GemmaChatWrapper);
            else if (splitLowercaseSubType.includes("chatml"))
                return createSpecializedChatWrapper(ChatMLChatWrapper);
        }
    }
    if (fileInfo != null) {
        const arch = fileInfo.metadata.general?.architecture;
        if (arch === "llama")
            return createSpecializedChatWrapper(GeneralChatWrapper);
        else if (arch === "falcon")
            return createSpecializedChatWrapper(FalconChatWrapper);
    }
    if (bosString === "" || bosString == null)
        return null;
    if ("<s>[INST] <<SYS>>\n".startsWith(bosString)) {
        return createSpecializedChatWrapper(Llama2ChatWrapper);
    }
    else if ("<|im_start|>system\n".startsWith(bosString)) {
        return createSpecializedChatWrapper(ChatMLChatWrapper);
    }
    return null;
}
export function isSpecializedChatWrapperType(type) {
    return specializedChatWrapperTypeNames.includes(type);
}
export function isTemplateChatWrapperType(type) {
    return templateChatWrapperTypeNames.includes(type);
}
function includesText(value, textToCheckFor, strictCase = false) {
    if (value instanceof Array)
        return value.some((v) => includesText(v, textToCheckFor, strictCase));
    else if (typeof value !== "string")
        return false;
    if (textToCheckFor instanceof Array)
        return textToCheckFor.some((t) => includesText(value, t, strictCase));
    if (strictCase)
        return value.includes(textToCheckFor);
    return value.toLowerCase().includes(textToCheckFor.toLowerCase());
}
// this is needed because TypeScript guards don't work automatically with class references
function isClassReference(value, classReference) {
    return value === classReference;
}
function orderChatWrapperNamesByAssumedCompatibilityWithModel(chatWrapperNames, { filename, fileInfo }) {
    const rankPoints = {
        modelName: 3,
        modelNamePosition: 4,
        fileName: 2,
        fileNamePosition: 3
    };
    function getPointsForTextMatch(pattern, fullText, existsPoints, positionPoints) {
        if (fullText == null)
            return 0;
        const index = fullText.toLowerCase().indexOf(pattern.toLowerCase());
        if (index >= 0)
            return existsPoints + (((index + 1) / fullText.length) * positionPoints);
        return 0;
    }
    const modelName = fileInfo?.metadata?.general?.name;
    return chatWrapperNames
        .slice()
        .sort((a, b) => {
        let aPoints = 0;
        let bPoints = 0;
        aPoints += getPointsForTextMatch(a, modelName, rankPoints.modelName, rankPoints.modelNamePosition);
        bPoints += getPointsForTextMatch(b, modelName, rankPoints.modelName, rankPoints.modelNamePosition);
        aPoints += getPointsForTextMatch(a, filename, rankPoints.fileName, rankPoints.fileNamePosition);
        bPoints += getPointsForTextMatch(b, filename, rankPoints.fileName, rankPoints.fileNamePosition);
        return bPoints - aPoints;
    });
}
//# sourceMappingURL=resolveChatWrapper.js.map