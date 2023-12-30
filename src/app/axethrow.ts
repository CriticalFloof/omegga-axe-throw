import { Brick, BrickInteraction, Vector } from "omegga";
import Runtime, { Storage } from "./main";
import ProjectileTracker from "src/lib/projectile_tracker";
import { checkLineBox } from "./intersection";

type Target = {
    brick: Brick;
    isMoving: boolean;
    startPos: Vector;
    endPos: Vector;
    speed: number;
    points: number;
};

type GameState = {
    isActive: boolean;
    player: string | null;
    startDate: number;
    finishDate: number;
    playerScore: number;
    movingTargetPercent: number;
    movingTargetSpeed: number;
    movingTargetSpeedVariance: number;
};

export default class Axethrow {
    public isSetup: boolean = false;
    private setupInitiator: string | null = null;

    public finishPosition: Vector = [0, 0, 0];
    public startButtonPosition: Vector = [0, 0, 0];
    public targetSurface: Brick = { size: [0, 0, 0], position: [0, 0, 0] };
    private targetBricks: Target[] = [];

    private targetProperties = [
        { size: 24, points: 1, color: [255, 255, 255, 255] },
        { size: 16, points: 2, color: [255, 100, 100, 255] },
        { size: 10, points: 3, color: [100, 255, 255, 255] },
        { size: 5, points: 5, color: [255, 100, 255, 255] },
    ];

    private startingGameState: GameState = {
        isActive: false,
        player: null,
        startDate: 0,
        finishDate: 0,
        playerScore: 0,
        movingTargetPercent: 0,
        movingTargetSpeed: 6,
        movingTargetSpeedVariance: 0,
    };

    public gameState: GameState = this.startingGameState;

    public static fromCache(cache: Storage["cache"]): Axethrow {
        let axethrow = new Axethrow();
        axethrow.targetSurface = cache.targetSurface;
        axethrow.startButtonPosition = cache.startButtonPosition;
        axethrow.finishPosition = cache.finishPosition;
        axethrow.isSetup = true;
        return axethrow;
    }

    constructor() {
        this.setupStartCheck = this.setupStartCheck.bind(this);
        this.setupTargetCheck = this.setupTargetCheck.bind(this);
        this.setupFinishCheck = this.setupFinishCheck.bind(this);
    }

    public setup(speaker: string) {
        this.setupInitiator = speaker;
        Runtime.omegga.on("interact", this.setupStartCheck);
        Runtime.omegga.whisper(
            speaker,
            "Setup 1/3",
            "Please place the brick for starting the axe throw game, and give it an interact component.",
            "It should log to the console 'axethrow_start'; this will activate the game for players.",
            "Click the brick to confirm this step is done."
        );
    }

    private setupStartCheck(interact: BrickInteraction) {
        if (interact.message !== "axethrow_start" || interact.player.name !== this.setupInitiator) return;
        Runtime.omegga.off("interact", this.setupStartCheck);
        Runtime.omegga.on("interact", this.setupTargetCheck);

        Runtime.omegga.whisper(
            interact.player.name,
            "Setup 2/3",
            "Now place the brick for the target surface, it should be a large flat brick that targets can appear on.",
            "It should log to the console 'axethrow_target'.",
            "Click the brick to confirm this step is done."
        );

        this.startButtonPosition = interact.position;
    }

    private setupTargetCheck(interact: BrickInteraction) {
        if (interact.message !== "axethrow_target" || interact.player.name !== this.setupInitiator) return;
        Runtime.omegga.off("interact", this.setupTargetCheck);
        Runtime.omegga.on("interact", this.setupFinishCheck);

        Runtime.omegga.whisper(
            interact.player.name,
            "Setup 3/3",
            "Now place the brick for the finish location, it should be a brick where players teleport to when they finish playing; this prevents one player hogging the game.",
            "It should log to the console 'axethrow_finish'.",
            "Click the brick to confirm this step is done."
        );

        this.targetSurface = { size: interact.brick_size, position: interact.position };
    }

    private setupFinishCheck(interact: BrickInteraction) {
        if (interact.message !== "axethrow_finish" || interact.player.name !== this.setupInitiator) return;
        Runtime.omegga.off("interact", this.setupTargetCheck);

        this.finishPosition = interact.position;

        Runtime.store.set("cache", {
            finishPosition: this.finishPosition,
            targetSurface: this.targetSurface,
            startButtonPosition: this.startButtonPosition,
        });

        Runtime.omegga.whisper(interact.player.name, "Setup complete!");
        this.isSetup = true;
    }

    public async play(player_name: string) {
        this.gameState = {
            ...this.startingGameState,
            isActive: true,
            player: player_name,
            startDate: Date.now(),
            finishDate: Date.now() + (Runtime.config.Start_Game_Length + 2) * 1000,
        };

        const player = Runtime.omegga.getPlayer(player_name);

        const axeGiveInterval = setInterval(() => {
            player?.giveItem("Weapon_Handaxe");
        }, 1000);

        Runtime.omegga.middlePrint(player_name, "Get Ready...");
        await new Promise((r) => {
            setTimeout(r, 1000);
        });
        Runtime.omegga.middlePrint(player_name, "Get Set.");
        await new Promise((r) => {
            setTimeout(r, 1000);
        });
        Runtime.omegga.middlePrint(player_name, "Go!");

        const projectile_tracker = new ProjectileTracker("Handaxe", Runtime.config.Poll_Rate);

        let lastTwoProjectileFrames: Record<string, [Vector, Vector]> = {};

        projectile_tracker.on("update", () => {
            const keys = Object.keys(projectile_tracker.projectiles);

            for (let i = 0; i < keys.length; i++) {
                const projectileData = projectile_tracker.projectiles[keys[i]];

                if (lastTwoProjectileFrames[keys[i]] === undefined) {
                    lastTwoProjectileFrames[keys[i]] = [
                        [0, 0, 0],
                        [0, 0, 0],
                    ];
                }

                lastTwoProjectileFrames[keys[i]] = [lastTwoProjectileFrames[keys[i]][1], projectileData.position];
            }
        });

        projectile_tracker.on("destroyed", (projectileName: string) => {
            const line = lastTwoProjectileFrames[projectileName];

            const lineDifference = [line[1][0] - line[0][0], line[1][1] - line[0][1], line[1][2] - line[0][2]];
            const extrusionDistance = 10;
            const extrudedEndPoint: Vector = [
                lineDifference[0] * extrusionDistance + line[0][0],
                lineDifference[1] * extrusionDistance + line[0][1],
                lineDifference[2] * extrusionDistance + line[0][2],
            ];

            const hit: { point: Vector } = { point: [0, 0, 0] };

            for (let i = 0; i < this.targetBricks.length; i++) {
                const target = this.targetBricks[i];
                if (checkLineBox(target.brick, [line[0], extrudedEndPoint], hit)) {
                    this.gameState = {
                        ...this.gameState,
                        playerScore: this.gameState.playerScore + target.points,
                        finishDate: this.gameState.finishDate + 2.5 * 1000,
                    };

                    Runtime.omegga.clearRegion({ center: target.brick.position, extent: target.brick.size });
                    this.targetBricks.splice(i, 1);
                }
            }
        });

        const gameTimeInterval = setInterval(() => {
            const secondsLeft = Math.ceil((this.gameState.finishDate - Date.now()) / 1000);
            Runtime.omegga.middlePrint(
                player_name,
                `<br><br><br><br><br><br><color="33ff33">${this.gameState.playerScore} points</><br>${secondsLeft}`
            );
        }, 1000);

        let generateTargetsTimeout: NodeJS.Timeout | null = null;
        const generateTargets = () => {
            for (let i = 0; i < this.targetBricks.length; i++) {
                const target = this.targetBricks[i];
                Runtime.omegga.clearRegion({ center: target.brick.position, extent: target.brick.size });
            }
            this.targetBricks = [];

            const bricks: Brick[] = [];

            const targetSizeDecrementChance = Math.min(((Date.now() - this.gameState.startDate) / 120000) * 0.7, 0.7);
            for (let i = 0; i < 5; i++) {
                let targetIndex = 0;
                while (Math.random() < targetSizeDecrementChance) {
                    if (targetIndex >= this.targetProperties.length - 1) break;
                    targetIndex += 1;
                }

                const chosenPosition = this.getRandomValidPosition(targetIndex);
                const targetBrickSize = this.getTargetBrickSize(targetIndex);

                const brick: Brick = {
                    color: this.targetProperties[targetIndex].color,
                    position: chosenPosition,
                    size: targetBrickSize,
                };

                const target: Target = {
                    brick,
                    isMoving: false,
                    startPos: brick.position,
                    endPos: brick.position,
                    speed: this.gameState.movingTargetSpeed,
                    points: this.targetProperties[targetIndex].points,
                };

                this.targetBricks.push(target);
                bricks.push(brick);
            }

            Runtime.omegga.loadSaveData(
                {
                    brick_assets: ["PB_DefaultMicroBrick"],
                    bricks,
                },
                { quiet: true }
            );

            if (this.gameState.finishDate - Date.now() > 0) {
                const lerp = Math.min((Date.now() - this.gameState.startDate) / 60000, 1);
                const timeout = ((1 - lerp) * 10 + lerp * 6.5) * 1000;
                generateTargetsTimeout = setTimeout(generateTargets, timeout);
            }
        };
        generateTargets();

        const clear = setInterval(async () => {
            if (this.gameState.finishDate - Date.now() < 0) {
                clearInterval(clear);
                clearInterval(axeGiveInterval);
                clearInterval(gameTimeInterval);
                clearTimeout(generateTargetsTimeout!);

                projectile_tracker.stop();
                for (let i = 0; i < 10; i++) {
                    player?.takeItem("Weapon_Handaxe");
                }

                let leaderboard = (await Runtime.store.get("leaderboard")) as Record<string, number> | undefined;
                if (leaderboard == undefined) leaderboard = {};
                if (leaderboard[this.gameState.player!] == undefined || leaderboard[this.gameState.player!] < this.gameState.playerScore) {
                    Runtime.omegga.whisper(this.gameState.player!, `<color="ffff55"><size="24">New Personal Best!</></>`);
                    //It's impossible to set a global highscore if you didn't even beat your personal best.
                    if (Math.max(...Object.values(leaderboard)) < this.gameState.playerScore) {
                        Runtime.omegga.broadcast(
                            `<color="ffff00">${this.gameState.player}</> set the new highest Axe Throw record with <size="24"><color="ffff00">${this.gameState.playerScore}</></> points!!!`
                        );
                    }
                    leaderboard[this.gameState.player!] = this.gameState.playerScore;
                }
                Runtime.store.set("leaderboard", leaderboard);

                Runtime.omegga.whisper(this.gameState.player!, `Your final score is <color="44ff44">${this.gameState.playerScore}</>!`);
                Runtime.omegga.writeln(
                    `Chat.Command /tp "${this.gameState.player}" ${this.finishPosition[0]} ${this.finishPosition[1]} ${this.finishPosition[2] + 24} 0`
                );
                this.gameState.player = null;

                for (let i = 0; i < this.targetBricks.length; i++) {
                    const target = this.targetBricks[i];
                    Runtime.omegga.clearRegion({ center: target.brick.position, extent: target.brick.size });
                }
                this.targetBricks = [];
                this.gameState.isActive = false;
            }
        }, 1000);
    }

    private getTargetBrickSize(targetPropertyIndex: number): Vector {
        const targetThickness = 2;

        const difference: Vector = [
            this.targetSurface.position[0] - this.startButtonPosition[0],
            this.targetSurface.position[1] - this.startButtonPosition[1],
            this.targetSurface.position[2] - this.startButtonPosition[2],
        ];
        const absoluteDifference: Vector = difference.map(Math.abs) as Vector;
        const axis: number = absoluteDifference.indexOf(Math.max(...absoluteDifference));

        let targetBrickSize: Vector = [0, 0, 0];

        if (axis === 0) {
            targetBrickSize = [
                targetThickness,
                Math.trunc(this.targetProperties[targetPropertyIndex].size),
                Math.trunc(this.targetProperties[targetPropertyIndex].size),
            ];
        } else if (axis === 1) {
            targetBrickSize = [
                Math.trunc(this.targetProperties[targetPropertyIndex].size),
                targetThickness,
                Math.trunc(this.targetProperties[targetPropertyIndex].size),
            ];
        } else {
            targetBrickSize = [
                Math.trunc(this.targetProperties[targetPropertyIndex].size),
                Math.trunc(this.targetProperties[targetPropertyIndex].size),
                targetThickness,
            ];
        }

        return targetBrickSize;
    }

    private getRandomValidPosition(targetPropertyIndex: number): Vector {
        // Find the correct facing direction
        const difference: Vector = [
            this.targetSurface.position[0] - this.startButtonPosition[0],
            this.targetSurface.position[1] - this.startButtonPosition[1],
            this.targetSurface.position[2] - this.startButtonPosition[2],
        ];
        const absoluteDifference: Vector = difference.map(Math.abs) as Vector;
        const axis: number = absoluteDifference.indexOf(Math.max(...absoluteDifference));
        const shouldFacePositive: boolean = difference[axis] < 0;
        const targetThickness = 2;
        const targetAxisPositionOffset = shouldFacePositive
            ? this.targetSurface.position[axis] + this.targetSurface.size[axis] + targetThickness
            : this.targetSurface.position[axis] + this.targetSurface.size[axis] - targetThickness;

        // Generate a hopefully non colliding random position on the surface of the target surface brick.
        let randomPosition: Vector = [0, 0, 0];

        if (axis === 0) {
            randomPosition = [
                targetAxisPositionOffset,
                this.targetSurface.position[1] + // Base position
                    Math.trunc(Math.random() * (this.targetSurface.size[1] * 2 - this.targetProperties[targetPropertyIndex].size * 2)) - // Increase random surface to cover possible spawns, accounting for brick size
                    (this.targetSurface.size[1] - this.targetProperties[targetPropertyIndex].size), // Offset to the minimum to the corner
                this.targetSurface.position[2] +
                    Math.trunc(Math.random() * (this.targetSurface.size[2] * 2 - this.targetProperties[targetPropertyIndex].size * 2)) -
                    (this.targetSurface.size[2] - this.targetProperties[targetPropertyIndex].size),
            ];
        } else if (axis === 1) {
            randomPosition = [
                this.targetSurface.position[0] +
                    Math.trunc(Math.random() * (this.targetSurface.size[0] * 2 - this.targetProperties[targetPropertyIndex].size * 2)) -
                    (this.targetSurface.size[0] - this.targetProperties[targetPropertyIndex].size),
                targetAxisPositionOffset,
                this.targetSurface.position[2] +
                    Math.trunc(Math.random() * (this.targetSurface.size[2] * 2 - this.targetProperties[targetPropertyIndex].size * 2)) -
                    (this.targetSurface.size[2] - this.targetProperties[targetPropertyIndex].size),
            ];
        } else {
            randomPosition = [
                this.targetSurface.position[0] +
                    Math.trunc(Math.random() * (this.targetSurface.size[0] * 2 - this.targetProperties[targetPropertyIndex].size * 2)) -
                    (this.targetSurface.size[0] - this.targetProperties[targetPropertyIndex].size),
                this.targetSurface.position[1] +
                    Math.trunc(Math.random() * (this.targetSurface.size[1] * 2 - this.targetProperties[targetPropertyIndex].size * 2)) -
                    (this.targetSurface.size[1] - this.targetProperties[targetPropertyIndex].size),
                targetAxisPositionOffset,
            ];
        }

        return randomPosition;
    }
}
