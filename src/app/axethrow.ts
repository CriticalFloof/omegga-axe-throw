import { Brick, BrickInteraction, Vector } from "omegga";
import Runtime, { Storage } from "./main";
import ProjectileTracker from "src/lib/projectile_tracker";
import { checkLineBox } from "./intersection";

export default class Axethrow {
    public isSetup: boolean = false;
    public playInitiator: string | null = null;
    private setupInitiator: string | null = null;

    public startButtonPosition: Vector = [0, 0, 0];
    public targetSurface: Brick = { size: [0, 0, 0], position: [0, 0, 0] };
    private targetBricks: Brick[] = [];

    private startingtargetSize: number = 24;

    private currenttargetSize: number = this.startingtargetSize;

    public score: number = 0;

    private whenGameFinished: number = 0;

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
        this.score = 0;
        this.playInitiator = player_name;
        this.currenttargetSize = this.startingtargetSize;

        const player = Runtime.omegga.getPlayer(player_name);

        this.whenGameFinished = Date.now() + Runtime.config.Start_Game_Length * 1000;

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
                if (checkLineBox(target, [line[0], extrudedEndPoint], hit)) {
                    this.score += 1;
                    Runtime.omegga.clearRegion({ center: target.position, extent: target.size });
                    this.targetBricks.splice(i, 1);
                    this.whenGameFinished += 2 * 1000;
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
            const secondsLeft = Math.ceil((this.whenGameFinished - Date.now()) / 1000);
            Runtime.omegga.middlePrint(player_name, `${secondsLeft}`);

            if (this.whenGameFinished - Date.now() < 0) {
                clearInterval(interval1);
                for (let i = 0; i < 10; i++) {
                    player?.takeItem("Weapon_Handaxe");
                }
                Runtime.omegga.whisper(this.playInitiator!, `You hit ${this.score} targets!`);
                this.playInitiator = null;
                projectile_tracker.stop();

                for (let i = 0; i < this.targetBricks.length; i++) {
                    const target = this.targetBricks[i];
                    Runtime.omegga.clearRegion({ center: target.position, extent: target.size });
                }
                this.targetBricks = [];
            }
        }, 1000);

        const interval2 = setInterval(() => {
            this.currenttargetSize = Math.max(this.currenttargetSize - this.startingtargetSize / 60, 4);

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
            let targetBrickSize: Vector = [0, 0, 0];

            if (axis === 0) {
                targetBrickSize = [targetThickness, Math.trunc(this.currenttargetSize), Math.trunc(this.currenttargetSize)];
            } else if (axis === 1) {
                targetBrickSize = [Math.trunc(this.currenttargetSize), targetThickness, Math.trunc(this.currenttargetSize)];
            } else {
                targetBrickSize = [Math.trunc(this.currenttargetSize), Math.trunc(this.currenttargetSize), targetThickness];
            }

            let randomPosition: Vector = [0, 0, 0];

            if (axis === 0) {
                randomPosition = [
                    targetAxisPositionOffset,
                    this.targetSurface.position[1] + // Base position
                        Math.trunc(Math.random() * (this.targetSurface.size[1] * 2 - this.currenttargetSize * 2)) - // Increase random surface to cover possible spawns, accounting for brick size
                        (this.targetSurface.size[1] - this.currenttargetSize), // Offset to the minimum to the corner
                    this.targetSurface.position[2] +
                        Math.trunc(Math.random() * (this.targetSurface.size[2] * 2 - this.currenttargetSize * 2)) -
                        (this.targetSurface.size[2] - this.currenttargetSize),
                ];
            } else if (axis === 1) {
                randomPosition = [
                    this.targetSurface.position[0] +
                        Math.trunc(Math.random() * (this.targetSurface.size[0] * 2 - this.currenttargetSize * 2)) -
                        (this.targetSurface.size[0] - this.currenttargetSize),
                    targetAxisPositionOffset,
                    this.targetSurface.position[2] +
                        Math.trunc(Math.random() * (this.targetSurface.size[2] * 2 - this.currenttargetSize * 2)) -
                        (this.targetSurface.size[2] - this.currenttargetSize),
                ];
            } else {
                randomPosition = [
                    this.targetSurface.position[0] +
                        Math.trunc(Math.random() * (this.targetSurface.size[0] * 2 - this.currenttargetSize * 2)) -
                        (this.targetSurface.size[0] - this.currenttargetSize),
                    this.targetSurface.position[1] +
                        Math.trunc(Math.random() * (this.targetSurface.size[1] * 2 - this.currenttargetSize * 2)) -
                        (this.targetSurface.size[1] - this.currenttargetSize),
                    targetAxisPositionOffset,
                ];
            }

            const brick: Brick = {
                color: [255, 255, 255, 0],
                position: randomPosition,
                size: targetBrickSize,
            };

            this.targetBricks.push(brick);

            Runtime.omegga.loadSaveData(
                {
                    brick_assets: ["PB_DefaultMicroBrick"],
                    bricks: [brick],
                },
                { quiet: true }
            );

            if (this.whenGameFinished - Date.now() < 0) {
                clearInterval(interval2);
            }
        }, 2000);
    }
}
