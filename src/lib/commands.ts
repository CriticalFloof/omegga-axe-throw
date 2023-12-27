import Runtime, { Configuration } from "src/app/main";

export interface CommandOptions {
    preset?: string;
    permissionCheck?: (speaker: string) => boolean;
    permissionErrorMessage?: () => string;
    cooldownMs?: number;
    cooldownErrorMessage?: (timeRemainingMs: number) => string;
}

/**
 * Helper Class for the creation and customization of common command features.
 */
export default class Command {
    public name: string;
    public listener: (speaker: string, ...commandArgs: string[]) => void;
    private cooldownList: Record<string, number> = {};

    private static OptionPresets: Record<string, Omit<Required<CommandOptions>, "preset">> = {
        default: {
            permissionCheck: () => true,
            permissionErrorMessage: () => "You do not have permission to use this command.",
            cooldownMs: 0,
            cooldownErrorMessage: (time_remaining) => `You are on cooldown, try again in ${Math.ceil(time_remaining / 1000)}s`,
        },
    };
    private static command_list: Command[] = [];

    /**
     * Creates a new command.
     * @param name
     * @param listener Function that's ran when the command is successfully called.
     * @param options check CommandOptions types for details.
     */
    constructor(name: string, listener: (speaker: string, ...commandArgs: string[]) => void, options: CommandOptions = {}) {
        const { preset = "default" } = options;
        if (Command.OptionPresets[preset] == undefined) {
            throw new Error(`Command Preset ${preset} doesn't exist, create one before using it.`);
        }

        const {
            permissionCheck = Command.OptionPresets[preset].permissionCheck,
            permissionErrorMessage = Command.OptionPresets[preset].permissionErrorMessage,
            cooldownMs = Command.OptionPresets[preset].cooldownMs,
            cooldownErrorMessage = Command.OptionPresets[preset].cooldownErrorMessage,
        } = options;

        this.name = name;
        this.listener = listener;

        if (!this.name.match(/^[a-zA-Z0-9_\-]+$/)) {
            throw new Error(`Command ${name} should only contain a-z, A-Z, 0-9, _ and -`);
        }

        Runtime.omegga.on(`cmd:${name}`, (speaker: string, ...args: string[]) => {
            if (!permissionCheck(speaker)) {
                Runtime.omegga.whisper(speaker, permissionErrorMessage());
                return;
            }

            if (this.cooldownList[speaker] > Date.now()) {
                Runtime.omegga.whisper(speaker, cooldownErrorMessage(this.cooldownList[speaker] - Date.now()));
                return;
            }
            this.cooldownList[speaker] = Date.now() + cooldownMs;

            listener(speaker, ...args);
        });
        Command.command_list.push(this);
    }

    public static getList(): string[] {
        return Command.command_list.map((v) => v.name);
    }

    public static presetExists(name: string): boolean {
        return Command.OptionPresets[name] !== undefined;
    }

    /**
     * Gets a reusable preset of command options, useful for basing new presets off of other presets.
     * @param name
     * @param preset
     */
    public static getPreset(name: string): Omit<Required<CommandOptions>, "preset"> | null {
        return Command.OptionPresets[name];
    }

    /**
     * Creates a reusable preset of command options
     * @param name
     * @param preset
     */
    public static createPreset(name: string, preset: Omit<Required<CommandOptions>, "preset">) {
        Command.OptionPresets[name] = preset;
    }

    /**
     * Removes a preset of command options
     * @param name
     * @param preset
     */
    public static removePreset(name: string) {
        delete Command.OptionPresets[name];
    }

    public static speakerIsHost(speaker: string): boolean {
        const player = Runtime.omegga.getPlayer(speaker)!;
        return player.isHost();
    }

    public static speakerHasRole(speaker: string, role: string): boolean {
        const player = Runtime.omegga.getPlayer(speaker)!;
        return player.getRoles().includes(role);
    }

    public static speakerHasConfigRole(speaker: string, config_name: keyof Configuration): boolean {
        const player = Runtime.omegga.getPlayer(speaker)!;
        return player.getRoles().includes(Runtime.config[config_name] as string);
    }
}
