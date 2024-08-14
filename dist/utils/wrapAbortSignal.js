export function wrapAbortSignal(abortSignal) {
    const controller = new AbortController();
    if (abortSignal != null)
        abortSignal.addEventListener("abort", () => {
            controller.abort(abortSignal.reason);
        });
    return controller;
}
//# sourceMappingURL=wrapAbortSignal.js.map