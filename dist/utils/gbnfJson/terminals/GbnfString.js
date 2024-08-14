import { GbnfTerminal } from "../GbnfTerminal.js";
import { reservedRuleNames } from "./gbnfConsts.js";
export class GbnfString extends GbnfTerminal {
    getGrammar() {
        return [
            '"\\""',
            or([
                negatedCharacterSet([
                    '"',
                    "\\\\",
                    "\\x7F",
                    "\\x00-\\x1F"
                ]),
                // escape sequences
                '"\\\\" ' + or([
                    '["\\\\/bfnrt]',
                    '"u" [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F]'
                ])
            ]) + "*",
            '"\\""'
        ].join(" ");
    }
    getRuleName() {
        return reservedRuleNames.string;
    }
}
function negatedCharacterSet(characterDefinitions) {
    return "[^" + characterDefinitions.join("") + "]";
}
function or(definitions) {
    return "(" + definitions.join(" | ") + ")";
}
//# sourceMappingURL=GbnfString.js.map