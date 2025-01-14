import retry from "async-retry";
import { withLock } from "lifecycle-utils";
import { GgufReadOffset } from "../utils/GgufReadOffset.js";
import { defaultExtraAllocationSize, ggufDefaultFetchRetryOptions } from "../consts.js";
import { GgufFileReader } from "./GgufFileReader.js";
export class GgufNetworkFetchFileReader extends GgufFileReader {
    url;
    retryOptions;
    headers;
    _signal;
    constructor({ url, retryOptions = ggufDefaultFetchRetryOptions, headers, signal }) {
        super();
        this.url = url;
        this.retryOptions = retryOptions;
        this.headers = headers ?? {};
        this._signal = signal;
    }
    readByteRange(offset, length) {
        const readOffset = GgufReadOffset.resolveReadOffset(offset);
        const endOffset = readOffset.offset + length;
        if (endOffset >= this._buffer.length)
            return this._fetchToExpandBufferUpToOffset(endOffset)
                .then(() => {
                const res = this._buffer.subarray(readOffset.offset, endOffset);
                readOffset.moveBy(length);
                return res;
            });
        const res = this._buffer.subarray(readOffset.offset, endOffset);
        readOffset.moveBy(length);
        return res;
    }
    ensureHasByteRange(offset, length) {
        const readOffset = GgufReadOffset.resolveReadOffset(offset);
        const endOffset = readOffset.offset + length;
        if (endOffset >= this._buffer.length)
            return this._fetchToExpandBufferUpToOffset(endOffset)
                .then(() => {
                if (endOffset >= this._buffer.length)
                    throw new Error("Expected buffer to be long enough for the requested byte range");
            });
        return undefined;
    }
    async _fetchToExpandBufferUpToOffset(endOffset, extraAllocationSize = defaultExtraAllocationSize) {
        await withLock(this, "modifyBuffer", this._signal, async () => {
            if (endOffset < this._buffer.length)
                return;
            const missingBytesBuffer = await retry(async (bail) => {
                try {
                    return await this._fetchByteRange(this._buffer.length, endOffset + extraAllocationSize - this._buffer.length);
                }
                catch (err) {
                    if (this._signal?.aborted) {
                        bail(this._signal.reason);
                        throw this._signal.reason;
                    }
                    throw err;
                }
            }, this.retryOptions);
            if (this._signal?.aborted)
                throw this._signal.reason;
            this._addToBuffer(missingBytesBuffer);
        });
    }
    async _fetchByteRange(start, length) {
        const response = await fetch(this.url, {
            headers: {
                ...this.headers,
                Range: `bytes=${start}-${start + length}`,
                accept: "*/*"
            },
            signal: this._signal
        });
        if (!response.ok)
            throw new Error(`Failed to fetch byte range: ${response.status} ${response.statusText}`);
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }
}
//# sourceMappingURL=GgufNetworkFetchFileReader.js.map