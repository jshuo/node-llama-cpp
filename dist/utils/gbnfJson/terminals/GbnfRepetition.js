import { GbnfTerminal } from "../GbnfTerminal.js";
import { grammarNoValue } from "./gbnfConsts.js";
export class GbnfRepetition extends GbnfTerminal {
    value;
    minRepetitions;
    maxRepetitions;
    constructor(value, minRepetitions, maxRepetitions) {
        super();
        this.value = value;
        this.minRepetitions = minRepetitions;
        this.maxRepetitions = maxRepetitions;
    }
    getGrammar(grammarGenerator) {
        const resolvedValue = this.value.resolve(grammarGenerator);
        let grammarStart = "";
        let grammarEnd = "";
        for (let i = 0; i < this.minRepetitions; i++) {
            grammarStart += "(" + resolvedValue + " ";
            grammarEnd += ")";
        }
        if (this.maxRepetitions === Infinity || this.maxRepetitions == null) {
            grammarStart += "(" + resolvedValue + " ";
            grammarEnd += ")*";
        }
        else {
            for (let i = this.minRepetitions + 1; i <= this.maxRepetitions; i++) {
                grammarStart += "(" + resolvedValue + " ";
                grammarEnd += ")?";
            }
        }
        const res = grammarStart + grammarEnd;
        if (res === "")
            return grammarNoValue;
        return res;
    }
}
//# sourceMappingURL=GbnfRepetition.js.map