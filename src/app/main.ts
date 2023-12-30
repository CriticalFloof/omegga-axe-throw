import { Brick, BrickInteraction, OL, PC, PS, Vector } from "omegga";
import Command from "src/lib/commands";
import Axethrow from "./axethrow";

/**
 * Runtime's persistent storage.
 */
export type Storage = {
    cache: {
        startButtonPosition: Vector;
        targetSurface: Brick;
    };
};

/**
 * Runtime's WebUI configuration.
 */
export type Configuration = {
    Load_Cache: boolean;
    Start_Game_Length: number;
    Trusted_Role: string;
};

export default class Runtime {
    static omegga: OL;
    static config: PC<Configuration>;
    static store: PS<Storage>;

    static axethrow: Axethrow;

    static async main(omegga: OL, config: PC<Configuration>, store: PS<Storage>) {
        [this.omegga, this.config, this.store] = [omegga, config, store];

        // Setup Cache
        const cache: Storage["cache"] | null = Runtime.config.Load_Cache ? await this.store.get("cache") : null;
        if (cache && cache.startButtonPosition != undefined && cache.targetSurface != undefined) {
            this.axethrow = Axethrow.fromCache(cache);
        }

        // Start button Logic
        this.omegga.on("interact", (interact: BrickInteraction) => {
            if (interact.message !== "axethrow_start") return;

            if (this.axethrow && this.axethrow.isSetup) {
                if (this.axethrow.gameState.player !== null) {
                    this.omegga.whisper(interact.player.name, "Someone is already playing the game!");
                } else {
                    this.axethrow.play(interact.player.name);
                }
            }
        });

        // Setup Command
        new Command(
            "axethrow_setup",
            (speaker: string) => {
                this.axethrow = new Axethrow();
                this.axethrow.setup(speaker);
            },
            {
                permissionCheck: (speaker) => Command.speakerHasConfigRole(speaker, "Trusted_Role"),
            }
        );
    }

    static async stop() {}
}
