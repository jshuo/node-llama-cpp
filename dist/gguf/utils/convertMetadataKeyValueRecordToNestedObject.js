import { getConsoleLogPrefix } from "../../utils/getConsoleLogPrefix.js";
export function convertMetadataKeyValueRecordToNestedObject(keyValueRecord, { logOverrideWarnings = true, ignoreKeys = [], noDirectSubNestingKeys } = {}) {
    const nestedObject = {};
    const ignoreKeySet = new Set(ignoreKeys);
    const noDirectSubNestingKeysSet = new Set(noDirectSubNestingKeys);
    for (const [key, value] of Object.entries(keyValueRecord)) {
        if (ignoreKeySet.has(key))
            continue;
        const { lastObject, lastKey } = getNestedObject(key, nestedObject, noDirectSubNestingKeysSet);
        if (Object.hasOwn(lastObject, lastKey)) {
            const currentValue = lastObject[lastKey];
            delete lastObject[lastKey];
            flattenNestedKeys(lastObject, lastKey, currentValue, logOverrideWarnings);
            if (Object.hasOwn(lastObject, lastKey) && logOverrideWarnings)
                console.warn(getConsoleLogPrefix() + `Metadata key "${key}" is already occupied by a value. Overwriting it.`);
        }
        lastObject[lastKey] = value;
    }
    return nestedObject;
}
function getNestedObject(key, nestedObject, noDirectSubNestingKeysSet) {
    const nestedKey = key.split(".");
    let lastKey = "";
    let currentObject = nestedObject;
    const previousKeys = [];
    while (nestedKey.length > 0) {
        let currentKey = nestedKey.shift();
        while (noDirectSubNestingKeysSet.has([...previousKeys, currentKey].join(".")) && nestedKey.length > 0)
            currentKey += "." + nestedKey.shift();
        if (nestedKey.length === 0) {
            lastKey = currentKey;
            break;
        }
        if (!Object.hasOwn(currentObject, currentKey)) {
            const nextCurrentObject = {};
            currentObject[currentKey] = nextCurrentObject;
            currentObject = nextCurrentObject;
        }
        else {
            const value = currentObject[currentKey];
            if (value instanceof Array || value == null || typeof value !== "object") {
                if (nestedKey.length > 0) {
                    nestedKey.unshift(currentKey + "." + nestedKey.shift());
                    continue;
                }
                throw new Error(`Cannot create nested object for key "${key}". The key "${currentKey}" is already occupied by a non-object value.`);
            }
            currentObject = value;
        }
        previousKeys.push(currentKey);
    }
    return {
        lastObject: currentObject,
        lastKey
    };
}
function flattenNestedKeys(parent, newParentKey, keyValue, logOverrideWarnings = false) {
    if (typeof keyValue !== "object" || keyValue instanceof Array) {
        parent[newParentKey] = keyValue;
        return;
    }
    for (const [key, subValue] of Object.entries(keyValue)) {
        const newKey = newParentKey + "." + key;
        if (Object.hasOwn(parent, newKey)) {
            const currentValue = parent[newKey];
            delete parent[newKey];
            flattenNestedKeys(parent, newKey, currentValue, logOverrideWarnings);
            if (Object.hasOwn(parent, newKey) && logOverrideWarnings)
                console.warn(getConsoleLogPrefix() + `Metadata key "${newKey}" is already occupied by a value. Overwriting it.`);
        }
        parent[newKey] = subValue;
    }
}
//# sourceMappingURL=convertMetadataKeyValueRecordToNestedObject.js.map