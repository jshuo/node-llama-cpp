import retry from "async-retry";
import { GgufReadOffset } from "../utils/GgufReadOffset.js";
import { GgufFileReader } from "./GgufFileReader.js";
type GgufFetchFileReaderOptions = {
    url: string;
    retryOptions?: retry.Options;
    headers?: Record<string, string>;
    signal?: AbortSignal;
};
export declare class GgufNetworkFetchFileReader extends GgufFileReader {
    readonly url: string;
    readonly retryOptions: retry.Options;
    readonly headers: Record<string, string>;
    private readonly _signal?;
    constructor({ url, retryOptions, headers, signal }: GgufFetchFileReaderOptions);
    readByteRange(offset: number | GgufReadOffset, length: number): Buffer | Promise<Buffer>;
    protected ensureHasByteRange(offset: number | GgufReadOffset, length: number): Promise<void> | undefined;
    private _fetchToExpandBufferUpToOffset;
    private _fetchByteRange;
}
export {};
