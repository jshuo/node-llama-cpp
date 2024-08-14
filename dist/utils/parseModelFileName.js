export function parseModelFileName(filename) {
    const parts = filename.split("-");
    let quantization;
    let fileType;
    let version;
    let contextSize;
    if (parts.length > 0) {
        const lastPart = parts[parts.length - 1];
        const lastParts = lastPart.split(".");
        fileType = lastParts.pop();
        quantization = lastParts.pop();
        if (lastParts.length > 0)
            parts[parts.length - 1] = lastParts.join(".");
        else
            parts.pop();
    }
    const { previousParts, parameters, nextParts } = splitByModelParameters(parts);
    const name = previousParts.shift();
    const otherInfo = [];
    for (let i = 0; i < nextParts.length; i++) {
        const part = nextParts[i];
        if (isContextSizeText(part)) {
            contextSize = part.toUpperCase();
            nextParts.splice(i, 1);
            i--;
        }
        else if (isVersionText(part)) {
            version = part.toLowerCase();
            nextParts.splice(i, 1);
            i--;
        }
        else {
            otherInfo.push(part);
        }
    }
    return {
        name,
        subType: previousParts.join("-"),
        quantization,
        fileType,
        version,
        contextSize,
        parameters,
        otherInfo
    };
}
function isParametersText(text) {
    return /^[0-9]+[Bb]$/.test(text);
}
function isVersionText(text) {
    return /^[vV]?[0-9]/.test(text);
}
function isContextSizeText(text) {
    return /^[0-9]+[kKmM]$/.test(text);
}
function splitByModelParameters(parts) {
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (isParametersText(part)) {
            return {
                parameters: part.toUpperCase(),
                previousParts: parts.slice(0, i),
                nextParts: parts.slice(i + 1)
            };
        }
    }
    return {
        parameters: undefined,
        previousParts: parts,
        nextParts: []
    };
}
//# sourceMappingURL=parseModelFileName.js.map