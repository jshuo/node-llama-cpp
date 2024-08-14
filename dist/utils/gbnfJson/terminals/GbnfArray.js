import { GbnfTerminal } from "../GbnfTerminal.js";
import { GbnfJsonScopeState } from "../utils/GbnfJsonScopeState.js";
import { GbnfWhitespace } from "./GbnfWhitespace.js";
import { GbnfGrammar } from "./GbnfGrammar.js";
import { GbnfOr } from "./GbnfOr.js";
export class GbnfArray extends GbnfTerminal {
    items;
    scopeState;
    constructor(items, scopeState = new GbnfJsonScopeState()) {
        super();
        this.items = items;
        this.scopeState = scopeState;
    }
    getGrammar(grammarGenerator) {
        const getWhitespaceRuleName = (newScope, newLine) => (newScope
            ? new GbnfWhitespace(this.scopeState.getForNewScope(), { newLine }).resolve(grammarGenerator)
            : new GbnfWhitespace(this.scopeState, { newLine }).resolve(grammarGenerator));
        const itemsGrammarRuleName = this.items.resolve(grammarGenerator);
        return new GbnfGrammar([
            '"["', getWhitespaceRuleName(true, "before"),
            new GbnfOr([
                new GbnfGrammar([
                    "(", itemsGrammarRuleName, ")",
                    "(", '","', getWhitespaceRuleName(true, "before"), itemsGrammarRuleName, ")*"
                ]),
                new GbnfGrammar([
                    "(", itemsGrammarRuleName, ")?"
                ])
            ]).getGrammar(grammarGenerator),
            getWhitespaceRuleName(false, "before"), '"]"'
        ]).getGrammar();
    }
}
//# sourceMappingURL=GbnfArray.js.map