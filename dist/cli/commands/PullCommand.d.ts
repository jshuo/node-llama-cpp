import { CommandModule } from "yargs";
type PullCommand = {
    url: string;
    header?: string[];
    override: boolean;
    noProgress: boolean;
    noTempFile: boolean;
    directory: string;
    filename?: string;
};
export declare const PullCommand: CommandModule<object, PullCommand>;
export {};
