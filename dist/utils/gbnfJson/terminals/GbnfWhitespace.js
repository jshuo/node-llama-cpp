import { GbnfTerminal } from "../GbnfTerminal.js";
import { reservedRuleNames } from "./gbnfConsts.js";
import { GbnfVerbatimText } from "./GbnfVerbatimText.js";
export class GbnfWhitespace extends GbnfTerminal {
    scopeState;
    newLine;
    constructor(scopeState, { newLine = "before" } = {}) {
        super();
        this.scopeState = scopeState;
        this.newLine = newLine;
    }
    getGrammar() {
        if (this.scopeState.settings.allowNewLines && this.newLine !== false) {
            const values = [
                ...(this.newLine === "before"
                    ? ["[\\n]"]
                    : []),
                ...(this.scopeState.currentNestingScope === 0
                    ? []
                    : [
                        or([
                            new GbnfVerbatimText(" ".repeat(this.scopeState.currentNestingScope * this.scopeState.settings.scopePadSpaces)).getGrammar(),
                            new GbnfVerbatimText("\t".repeat(this.scopeState.currentNestingScope)).getGrammar()
                        ])
                    ]),
                ...(this.newLine === "after"
                    ? ["[\\n]"]
                    : [])
            ];
            return or([
                values.join(" "),
                "[ ]?"
            ]);
        }
        return "[ ]?";
    }
    getRuleName() {
        return reservedRuleNames.whitespace({
            newLine: this.newLine,
            scopeSpaces: this.scopeState.settings.scopePadSpaces,
            nestingScope: this.scopeState.currentNestingScope
        });
    }
}
function or(definitions) {
    return "(" + definitions.join(" | ") + ")";
}
//# sourceMappingURL=GbnfWhitespace.js.map