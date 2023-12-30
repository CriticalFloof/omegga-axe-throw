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
};

type GameState = {
    player: string | null;
    finishDate: number;
    playerScore: number;
    targetSize: number;
    movingTargetPercent: number;
    movingTargetSpeed: number;
    movingTargetSpeedVariance: number;
};

export default class Axethrow {
    public isSetup: boolean = false;
    private setupInitiator: string | null = null;

    public startButtonPosition: Vector = [0, 0, 0];
    public targetSurface: Brick = { size: [0, 0, 0], position: [0, 0, 0] };
    private targetBricks: Target[] = [];

    private startingGameState: GameState = {
        player: null,
        finishDate: 0,
        playerScore: 0,
        targetSize: 24,
        movingTargetPercent: 0,
        movingTargetSpeed: 6,
        movingTargetSpeedVariance: 0,
    };

    public gameState: GameState = this.startingGameState;

    public static fromCache(cache: Storage["cache"]): Axethrow {
        let axethrow = new Axethrow();
        axethrow.targetSurface = cache.targetSurface;
        axethrow.startButtonPosition = cache.startButtonPosition;
        axethrow.isSetup = true;
        return axethrow;
    }

    constructor() {
        this.setupStartCheck = this.setupStartCheck.bind(this);
        this.setupTargetCheck = this.setupTargetCheck.bind(this);
    }

    public setup(speaker: string) {
        this.setupInitiator = speaker;
        Runtime.omegga.on("interact", this.setupStartCheck);
        Runtime.omegga.whisper(
            speaker,
            "Setup 1/2",
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
            "Setup 2/2",
            "Now place the brick for the target surface, it should be a large flat brick that targets can appear on.",
            "It should log to the console 'axethrow_target'.",
            "Click the brick to confirm this step is done."
        );

        this.startButtonPosition = interact.position;
    }

    private setupTargetCheck(interact: BrickInteraction) {
        if (interact.message !== "axethrow_target" || interact.player.name !== this.setupInitiator) return;
        Runtime.omegga.off("interact", this.setupTargetCheck);

        this.targetSurface = { size: interact.brick_size, position: interact.position };

        Runtime.omegga.whisper(interact.player.name, "Setup complete!");

        Runtime.store.set("cache", {
            targetSurface: this.targetSurface,
            startButtonPosition: this.startButtonPosition,
        });

        this.isSetup = true;
    }

    public play(player_name: string) {
        this.gameState = {
            ...this.startingGameState,
            player: player_name,
            finishDate: Date.now() + Runtime.config.Start_Game_Length * 1000,
        };

        const player = Runtime.omegga.getPlayer(player_name);

        const projectile_tracker = new ProjectileTracker("Handaxe", 150);

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
                        playerScore: this.gameState.playerScore + 1,
                        finishDate: this.gameState.finishDate + 2 * 1000,
                    };
                    Runtime.omegga.clearRegion({ center: target.brick.position, extent: target.brick.size });
                    this.targetBricks.splice(i, 1);
                }
            }

            //debug
            /*

            Runtime.omegga.clearBricks({ id: "ffffffff-ffff-ffff-ffff-fffffffffffa" }, true);

            const save: WriteSaveObject = {
                brick_assets: ["PB_DefaultMicroBrick"],
                brick_owners: [
                    {
                        id: "ffffffff-ffff-ffff-ffff-fffffffffffa",
                        name: "TestRay",
                    },
                ],
                bricks: [],
            };

            for (let i = 0; i < 40; i++) {
                const point = line[0];
                save.bricks.push({
                    color: [255, 0, 0, 255],
                    size: [2, 2, 2],
                    owner_index: 1,
                    position: [
                        ((extrudedEndPoint[0] - point[0]) / 40) * i + point[0],
                        ((extrudedEndPoint[1] - point[1]) / 40) * i + point[1],
                        ((extrudedEndPoint[2] - point[2]) / 40) * i + point[2],
                    ],
                });
            }

            if (save.bricks.length > 0) {
                Runtime.omegga.loadSaveData(save, { quiet: false });
            }
            */
        });

        const interval1 = setInterval(() => {
            player?.giveItem("Weapon_Handaxe");
            const secondsLeft = Math.ceil((this.gameState.finishDate - Date.now()) / 1000);
            Runtime.omegga.middlePrint(player_name, `${secondsLeft}`);

            if (this.gameState.finishDate - Date.now() < 0) {
                clearInterval(interval1);
                for (let i = 0; i < 10; i++) {
                    player?.takeItem("Weapon_Handaxe");
                }
                Runtime.omegga.whisper(this.gameState.player!, `Your score is <color="33ff33">${this.gameState.playerScore}</>!`);
                this.gameState.player = null;
                projectile_tracker.stop();

                for (let i = 0; i < this.targetBricks.length; i++) {
                    const target = this.targetBricks[i];
                    Runtime.omegga.clearRegion({ center: target.brick.position, extent: target.brick.size });
                }
                this.targetBricks = [];
            }
        }, 1000);

        const interval2 = setInterval(() => {
            // Update global game state.
            this.gameState.targetSize = Math.max(this.gameState.targetSize - this.startingGameState.targetSize / 60, 4);

            const chosenPosition = this.getRandomValidPosition();
            const targetBrickSize = this.getTargetBrickSize();

            const brick: Brick = {
                color: [255, 255, 255, 0],
                position: chosenPosition,
                size: targetBrickSize,
            };

            const target: Target = {
                brick,
                isMoving: false,
                startPos: brick.position,
                endPos: brick.position,
                speed: this.gameState.movingTargetSpeed,
            };

            this.targetBricks.push(target);

            Runtime.omegga.loadSaveData(
                {
                    brick_assets: ["PB_DefaultMicroBrick"],
                    bricks: [brick],
                },
                { quiet: true }
            );

            if (this.gameState.finishDate - Date.now() < 0) {
                clearInterval(interval2);
            }
        }, 2000);
    }

    private getTargetBrickSize(): Vector {
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
            targetBrickSize = [targetThickness, Math.trunc(this.gameState.targetSize), Math.trunc(this.gameState.targetSize)];
        } else if (axis === 1) {
            targetBrickSize = [Math.trunc(this.gameState.targetSize), targetThickness, Math.trunc(this.gameState.targetSize)];
        } else {
            targetBrickSize = [Math.trunc(this.gameState.targetSize), Math.trunc(this.gameState.targetSize), targetThickness];
        }

        return targetBrickSize;
    }

    private getRandomValidPosition(): Vector {
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
                    Math.trunc(Math.random() * (this.targetSurface.size[1] * 2 - this.gameState.targetSize * 2)) - // Increase random surface to cover possible spawns, accounting for brick size
                    (this.targetSurface.size[1] - this.gameState.targetSize), // Offset to the minimum to the corner
                this.targetSurface.position[2] +
                    Math.trunc(Math.random() * (this.targetSurface.size[2] * 2 - this.gameState.targetSize * 2)) -
                    (this.targetSurface.size[2] - this.gameState.targetSize),
            ];
        } else if (axis === 1) {
            randomPosition = [
                this.targetSurface.position[0] +
                    Math.trunc(Math.random() * (this.targetSurface.size[0] * 2 - this.gameState.targetSize * 2)) -
                    (this.targetSurface.size[0] - this.gameState.targetSize),
                targetAxisPositionOffset,
                this.targetSurface.position[2] +
                    Math.trunc(Math.random() * (this.targetSurface.size[2] * 2 - this.gameState.targetSize * 2)) -
                    (this.targetSurface.size[2] - this.gameState.targetSize),
            ];
        } else {
            randomPosition = [
                this.targetSurface.position[0] +
                    Math.trunc(Math.random() * (this.targetSurface.size[0] * 2 - this.gameState.targetSize * 2)) -
                    (this.targetSurface.size[0] - this.gameState.targetSize),
                this.targetSurface.position[1] +
                    Math.trunc(Math.random() * (this.targetSurface.size[1] * 2 - this.gameState.targetSize * 2)) -
                    (this.targetSurface.size[1] - this.gameState.targetSize),
                targetAxisPositionOffset,
            ];
        }

        return randomPosition;
    }

    private getRandomValidTrack() {}
}
