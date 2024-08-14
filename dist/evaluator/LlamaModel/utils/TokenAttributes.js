// updated against `enum llama_token_attr` from `llama.h`
export var TokenAttribute;
(function (TokenAttribute) {
    TokenAttribute[TokenAttribute["undefined"] = 0] = "undefined";
    TokenAttribute[TokenAttribute["unknown"] = 2] = "unknown";
    TokenAttribute[TokenAttribute["unused"] = 4] = "unused";
    TokenAttribute[TokenAttribute["normal"] = 8] = "normal";
    TokenAttribute[TokenAttribute["control"] = 16] = "control";
    TokenAttribute[TokenAttribute["userDefined"] = 32] = "userDefined";
    TokenAttribute[TokenAttribute["byte"] = 64] = "byte";
    TokenAttribute[TokenAttribute["normalized"] = 128] = "normalized";
    TokenAttribute[TokenAttribute["lstrip"] = 256] = "lstrip";
    TokenAttribute[TokenAttribute["rstrip"] = 512] = "rstrip";
    TokenAttribute[TokenAttribute["singleWord"] = 1024] = "singleWord";
})(TokenAttribute || (TokenAttribute = {}));
export class TokenAttributes {
    token;
    /** @internal */ _attributes;
    constructor(token, attributes) {
        this.token = token;
        this._attributes = attributes;
    }
    get undefined() {
        return this._attributes === TokenAttribute.undefined;
    }
    get unknown() {
        return this._hasAttribute(TokenAttribute.unknown);
    }
    get unused() {
        return this._hasAttribute(TokenAttribute.unused);
    }
    get normal() {
        return this._hasAttribute(TokenAttribute.normal);
    }
    get control() {
        return this._hasAttribute(TokenAttribute.control);
    }
    get userDefined() {
        return this._hasAttribute(TokenAttribute.userDefined);
    }
    get byte() {
        return this._hasAttribute(TokenAttribute.byte);
    }
    get normalized() {
        return this._hasAttribute(TokenAttribute.normalized);
    }
    get lstrip() {
        return this._hasAttribute(TokenAttribute.lstrip);
    }
    get rstrip() {
        return this._hasAttribute(TokenAttribute.rstrip);
    }
    get singleWord() {
        return this._hasAttribute(TokenAttribute.singleWord);
    }
    /** @internal */
    _hasAttribute(attribute) {
        return (this._attributes & attribute) === attribute;
    }
    /** @internal */
    static _create(token, attributes) {
        return new TokenAttributes(token, attributes);
    }
}
//# sourceMappingURL=TokenAttributes.js.map