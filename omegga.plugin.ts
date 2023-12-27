import OmeggaPlugin, { OL, PS, PC } from "omegga";
import Runtime from "src/app/main";
import Command from "src/lib/commands";

export default class Plugin implements OmeggaPlugin<Record<string, unknown>, Record<string, unknown>> {
    omegga: OL;
    config: PC<any>;
    store: PS<any>;

    constructor(omegga: OL, config: PC<Record<string, unknown>>, store: PS<Record<string, unknown>>) {
        this.omegga = omegga;
        this.config = config;
        this.store = store;
    }

    async init() {
        Runtime.main(this.omegga, this.config, this.store);
        return { registeredCommands: Command.getList() };
    }

    async stop() {
        Runtime.stop();
    }
}
