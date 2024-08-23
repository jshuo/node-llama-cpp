import * as crypto from "node:crypto";
export async function hashString(text) {
    const hashBuffer = await crypto.subtle.digest("SHA-1", Buffer.from(text));
    return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(36))
        .join("");
}
//# sourceMappingURL=hashString.js.map