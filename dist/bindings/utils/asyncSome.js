import { getConsoleLogPrefix } from "../../utils/getConsoleLogPrefix.js";
/**
 * Returns a promise that fulfills as soon as any of the promises return `true`.
 * Note that this function will not throw on error and instead will log the error to the console.
 */
export async function asyncSome(promises) {
    return new Promise((resolve) => {
        let fulfilled = 0;
        for (const promise of promises) {
            promise
                .then((result) => {
                if (result)
                    return void resolve(true);
                fulfilled++;
                if (fulfilled === promises.length)
                    resolve(false);
            })
                .catch((err) => {
                console.error(getConsoleLogPrefix(false, false), err);
                fulfilled++;
                if (fulfilled === promises.length)
                    resolve(false);
            });
        }
    });
}
//# sourceMappingURL=asyncSome.js.map