export declare class LruCache<Key, Value> {
    readonly maxSize: number;
    constructor(maxSize: number, { onDelete }?: {
        onDelete?(key: Key, value: Value): void;
    });
    get(key: Key): NonNullable<Value> | undefined;
    set(key: Key, value: Value): this;
    get firstKey(): any;
    clear(): void;
    keys(): IterableIterator<Key>;
    delete(key: Key): void;
}
