import { GbnfJsonSchema, GbnfJsonSchemaToType } from "../../../utils/gbnfJson/types.js";
import { ChatSessionModelFunction } from "../../../types.js";
/**
 * @param functionDefinition
 */
export declare function defineChatSessionFunction<const Params extends GbnfJsonSchema | undefined>({ description, params, handler }: {
    description?: string;
    params?: Params;
    handler: (params: GbnfJsonSchemaToType<Params>) => any;
}): ChatSessionModelFunction<Params>;
