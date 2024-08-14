import { Token } from "../../../types.js";
export declare const enum TokenAttribute {
    undefined = 0,
    unknown = 2,
    unused = 4,
    normal = 8,
    control = 16,// SPECIAL
    userDefined = 32,
    byte = 64,
    normalized = 128,
    lstrip = 256,
    rstrip = 512,
    singleWord = 1024
}
export declare class TokenAttributes {
    readonly token: Token;
    private constructor();
    get undefined(): boolean;
    get unknown(): boolean;
    get unused(): boolean;
    get normal(): boolean;
    get control(): boolean;
    get userDefined(): boolean;
    get byte(): boolean;
    get normalized(): boolean;
    get lstrip(): boolean;
    get rstrip(): boolean;
    get singleWord(): boolean;
}
