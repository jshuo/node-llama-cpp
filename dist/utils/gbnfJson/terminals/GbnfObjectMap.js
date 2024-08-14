import { GbnfTerminal } from "../GbnfTerminal.js";
import { GbnfJsonScopeState } from "../utils/GbnfJsonScopeState.js";
import { GbnfWhitespace } from "./GbnfWhitespace.js";
import { GbnfGrammar } from "./GbnfGrammar.js";
export class GbnfObjectMap extends GbnfTerminal {
    fields;
    scopeState;
    constructor(fields, scopeState = new GbnfJsonScopeState()) {
        super();
        this.fields = fields;
        this.scopeState = scopeState;
    }
    getGrammar(grammarGenerator) {
        const getWhitespaceRuleName = (newScope, newLine) => (newScope
            ? new GbnfWhitespace(this.scopeState.getForNewScope(), { newLine }).resolve(grammarGenerator)
            : new GbnfWhitespace(this.scopeState, { newLine }).resolve(grammarGenerator));
        return new GbnfGrammar([
            '"{"', getWhitespaceRuleName(true, "before"),
            ...this.fields.map(({ key, value }, index) => {
                return new GbnfGrammar([
                    key.getGrammar(), '":"', "[ ]?", value.resolve(grammarGenerator),
                    index < this.fields.length - 1 ? '","' : "",
                    getWhitespaceRuleName(index < this.fields.length - 1, "before")
                ]).getGrammar();
            }),
            '"}"'
        ]).getGrammar();
    }
}
//# sourceMappingURL=GbnfObjectMap.js.map