import { Brick, BrickInteraction, OL, PC, PS, Vector } from "omegga";
import Command from "src/lib/commands";
import Axethrow from "./axethrow";

/**
 * Runtime's persistent storage.
 */
export type Storage = {
    cache: {
        finishPosition: Vector;
        startButtonPosition: Vector;
        targetSurface: Brick;
    };
    leaderboard: Record<string, number>;
};

/**
 * Runtime's WebUI configuration.
 */
export type Configuration = {
    Reset_Leaderboard: boolean;
    Load_Cache: boolean;
    Poll_Rate: number;
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

        if (this.config.Reset_Leaderboard) {
            this.store.set("leaderboard", {});
        }

        // Setup Cache
        const cache: Storage["cache"] | null = Runtime.config.Load_Cache ? await this.store.get("cache") : null;
        if (cache && cache.startButtonPosition != undefined && cache.targetSurface != undefined) {
            this.axethrow = Axethrow.fromCache(cache);
        }

        // Start button Logic
        this.omegga.on("interact", (interact: BrickInteraction) => {
            if (interact.message !== "axethrow_start") return;

            if (this.axethrow && this.axethrow.isSetup) {
                if (this.axethrow.gameState.isActive) {
                    this.omegga.whisper(interact.player.name, "A game is already in session!");
                } else {
                    this.axethrow.play(interact.player.name);
                }
            } else {
                this.omegga.whisper(interact.player.name, "Axe throw has not been set up yet, if you see this message let an admin know.");
            }
        });

        // Setup Commands
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

        new Command("axethrow_pb", async (speaker: string) => {
            const leaderboard = (await this.store.get("leaderboard")) as Record<string, number> | undefined;
            if (leaderboard && leaderboard[speaker] !== undefined) {
                this.omegga.whisper(speaker, `Your personal best is <color="ffff44">${leaderboard[speaker]}</> points.`);
            } else {
                this.omegga.whisper(speaker, "You haven't played Axe Throw yet.");
            }
        });

        new Command("axethrow_top", async (speaker: string) => {
            const leaderboard = (await this.store.get("leaderboard")) as Record<string, number> | undefined;

            if (leaderboard) {
                let playerPairs = Object.entries(leaderboard);

                let topFivePlayers: [string, number][] = [];
                for (let i = 0; i < 5; i++) {
                    if (playerPairs.length === 0) break;
                    const scores = playerPairs.map((v) => v[1]);
                    const index = scores.indexOf(Math.max(...scores));
                    topFivePlayers.push(playerPairs[index]);
                    playerPairs.splice(index, 1);
                }

                topFivePlayers.sort((a, b) => b[1] - a[1]);

                let topFiveStrings: string[] = [];

                for (let i = 0; i < topFivePlayers.length; i++) {
                    const [player, score] = topFivePlayers[i];

                    const placements = [
                        '<size="26"><color="ffff22">1st</></>',
                        '<size="24"><color="aaaaaa">2nd</></>',
                        '<size="22"><color="bb6622">3rd</></>',
                        '<size="20"><color="555555">4th</></>',
                        '<size="20"><color="555555">5th</></>',
                    ];

                    topFiveStrings.push(`${placements[i]} <color="ffff77">${player}</> with <color="44ff44">${score}</> points!`);
                }

                this.omegga.whisper(speaker, `Top 5 axe throw players.`, ...topFiveStrings);
            } else {
                this.omegga.whisper(speaker, "Nobody has played Axe Throw yet. :(");
            }
        });
    }

    static async stop() {}
}
