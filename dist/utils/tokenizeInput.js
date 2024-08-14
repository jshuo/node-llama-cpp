import { isLlamaText } from "./LlamaText.js";
import { isToken } from "./isToken.js";
export function tokenizeInput(input, tokenizer, options) {
    if (typeof input === "string")
        return tokenizer(input, false, options);
    else if (isLlamaText(input))
        return input.tokenize(tokenizer, options);
    else if (isToken(input))
        return [input];
    return input;
}
//# sourceMappingURL=tokenizeInput.js.map