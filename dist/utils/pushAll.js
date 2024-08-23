/**
 * Pushes all items from the given array or set to the given array.
 * @param array - The array to push the items to
 * @param items - The items to push to the array
 */
export function pushAll(array, items) {
    for (const item of items)
        array.push(item);
    return array;
}
//# sourceMappingURL=pushAll.js.map