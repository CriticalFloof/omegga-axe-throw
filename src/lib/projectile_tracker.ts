import { Vector } from "omegga";
import Runtime from "src/app/main";
import EventEmitter from "events";

export type ProjectileData = {
    position: Vector;
    timeFound: number;
};

interface ProjectileEvents {
    created: (projectile: string) => void;
    destroyed: (projectile: string) => void;
    update: () => void;
}

export default class ProjectileTracker extends EventEmitter {
    private intervalId: NodeJS.Timeout;
    public projectiles: Record<string, ProjectileData> = {};

    public constructor(name: string, frequency: number) {
        super();
        const ProjectileRegExp = new RegExp(`Projectile_${name}_C .+PersistentLevel\.(?<projectile>.+)`);

        this.intervalId = setInterval(async () => {
            let projectileStaging: Record<string, ProjectileData> = {};
            let createdProjectiles: string[] = [];
            const projectiles = await Runtime.omegga.addWatcher<RegExpMatchArray>(ProjectileRegExp, {
                exec: () => Runtime.omegga.writeln(`getAll Projectile_${name}_C RelativeLocation`),
                bundle: true,
                timeoutDelay: 100,
            });
            for (let i = 0; i < projectiles.length; i++) {
                const projectile = projectiles[i].groups?.["projectile"];
                if (!projectile) continue;

                if (!this.projectiles[projectile]) {
                    createdProjectiles.push(projectile);
                }

                const ProjectileColliderPosition = new RegExp(
                    `SphereComponent .+?PersistentLevel\\.${projectile}\\.CollisionComponent\\.RelativeLocation = \\(X=(?<x>[\\d\\.-]+),Y=(?<y>[\\d\\.-]+),Z=(?<z>[\\d\\.-]+)\\)`
                );

                const [projectilePosition] = (await Runtime.omegga.addWatcher<RegExpMatchArray>(ProjectileColliderPosition, {
                    exec: () => Runtime.omegga.writeln(`getAll SphereComponent RelativeLocation Outer=${projectile}`),
                    bundle: true,
                    timeoutDelay: 100,
                })) as [RegExpMatchArray | undefined];

                if (!projectilePosition) continue;
                if (!projectilePosition.groups) continue;

                const { x, y, z } = projectilePosition.groups;

                projectileStaging[projectile] = {
                    position: [parseFloat(x), parseFloat(y), parseFloat(z)],
                    timeFound: this.projectiles[projectile] ? this.projectiles[projectile].timeFound : Date.now(),
                };
            }
            const projectilesKeys = Object.keys(this.projectiles);
            for (let i = 0; i < projectilesKeys.length; i++) {
                if (!projectileStaging[projectilesKeys[i]]) {
                    this.emit("destroyed", projectilesKeys[i]);
                }
            }

            this.projectiles = projectileStaging;

            createdProjectiles.forEach((projectile) => this.emit("created", projectile));

            this.emit("update");
        }, frequency);
    }

    on(eventName: keyof ProjectileEvents, listener: ProjectileEvents[keyof ProjectileEvents]) {
        return super.on(eventName, listener);
    }

    stop() {
        clearInterval(this.intervalId);
    }
}
