import { GeneralChatWrapper } from "./GeneralChatWrapper.js";
export class AlpacaChatWrapper extends GeneralChatWrapper {
    wrapperName = "AlpacaChat";
    constructor({ userMessageTitle = "Instruction", modelResponseTitle = "Response", middleSystemMessageTitle = "System", allowSpecialTokensInTitles = false } = {}) {
        super({
            userMessageTitle: userMessageTitle + ":",
            modelResponseTitle: modelResponseTitle + ":",
            middleSystemMessageTitle: middleSystemMessageTitle + ":",
            allowSpecialTokensInTitles
        });
    }
    get userMessageTitle() {
        return super.userMessageTitle.slice(0, -1);
    }
    get modelResponseTitle() {
        return super.modelResponseTitle.slice(0, -1);
    }
    get middleSystemMessageTitle() {
        return super.middleSystemMessageTitle.slice(0, -1);
    }
    /** @internal */
    static _getOptionConfigurationsToTestIfCanSupersedeJinjaTemplate() {
        return [{}, {
                allowSpecialTokensInTitles: true
            }];
    }
}
//# sourceMappingURL=AlpacaChatWrapper.js.map