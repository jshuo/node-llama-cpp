export function isChatModelResponseFunctionCall(item) {
    if (typeof item === "string")
        return false;
    return item.type === "functionCall";
}
//# sourceMappingURL=types.js.map