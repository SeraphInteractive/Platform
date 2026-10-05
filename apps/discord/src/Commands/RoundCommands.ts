import { RoundStatus } from "@platform/contracts";
import {
    MessageFlags,
    SlashCommandBuilder,
    type AutocompleteInteraction,
    type ButtonInteraction,
    type ChatInputCommandInteraction,
    type StringSelectMenuInteraction
} from "discord.js";
import { asEdit, truncate, type V2Message } from "../Discord/Ui.js";
import {
    entryPage,
    entryPagePrefix,
    leaderboard,
    results,
    roundDetail,
    roundList,
    roundSelect,
    roundSelectPrefix,
    RoundView,
    sortRounds,
    telemetry
} from "../Views/RoundViews.js";
import { actingAs, type BotContext, type ComponentHandler, type ComponentInteraction, type SlashCommand } from "./Command.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

const prompts: Readonly<Record<RoundView, string>> = {
    [RoundView.Detail]: "Which round?",
    [RoundView.Entries]: "Browse the entries of which round?",
    [RoundView.Leaderboard]: "Show standings for which round?",
    [RoundView.Results]: "Show results for which round?",
    [RoundView.Telemetry]: "Show telemetry for which round?"
};

async function renderRound(
    view: RoundView,
    roundId: string,
    interaction: { readonly user: ChatInputCommandInteraction["user"] },
    context: BotContext
): Promise<V2Message> {
    const api = actingAs(interaction, context);
    const round = await api.getRound(roundId);
    switch (view) {
        case RoundView.Detail:
            return roundDetail(round, context.configuration.webAppUrl);
        case RoundView.Entries:
            return entryPage(round, await api.listEntries(roundId), 0);
        case RoundView.Leaderboard:
            return leaderboard(round, await api.getLeaderboard(roundId));
        case RoundView.Results:
            return results(round, await api.getResults(roundId));
        case RoundView.Telemetry: {
            const [snapshots, entries] = await Promise.all([api.getTelemetry(roundId), api.listEntries(roundId)]);
            return telemetry(round, snapshots, entries);
        }
    }
}

async function autocompleteRound(interaction: AutocompleteInteraction, context: BotContext, status?: RoundStatus): Promise<void> {
    const query = interaction.options.getFocused().toLowerCase();
    try {
        const rounds = await actingAs(interaction, context).listRounds(status);
        const choices = sortRounds(rounds.data)
            .filter((round) => round.title.toLowerCase().includes(query))
            .slice(0, 25)
            .map((round) => ({ name: truncate(`${round.title} (${round.status})`, 100), value: round.id }));
        await interaction.respond(choices);
    } catch {
        await interaction.respond([]).catch(() => undefined);
    }
}

function roundCommand(name: string, description: string, view: RoundView, ephemeral: boolean, status?: RoundStatus): SlashCommand {
    return {
        definition: new SlashCommandBuilder()
            .setName(name)
            .setDescription(description)
            .addStringOption((option) => option.setName("round").setDescription("Leave empty to pick from a list").setAutocomplete(true))
            .toJSON(),
        async execute(interaction: ChatInputCommandInteraction, context: BotContext): Promise<void> {
            await interaction.deferReply(ephemeral ? { flags: MessageFlags.Ephemeral } : {});
            const roundId = interaction.options.getString("round");
            if (roundId === null) {
                const rounds = await actingAs(interaction, context).listRounds(status);
                const payload = rounds.data.length === 0 ? roundList([]) : roundSelect(view, rounds.data, prompts[view]);
                await interaction.editReply(asEdit(payload));
                return;
            }
            if (!uuidPattern.test(roundId)) {
                await interaction.editReply(asEdit(roundList([])));
                return;
            }
            const payload = await renderRound(view, roundId, interaction, context);
            await interaction.editReply(asEdit(payload));
        },
        async autocomplete(interaction: AutocompleteInteraction, context: BotContext): Promise<void> {
            await autocompleteRound(interaction, context, status);
        }
    };
}

export const roundsCommand: SlashCommand = {
    definition: new SlashCommandBuilder()
        .setName("rounds")
        .setDescription("List voting rounds")
        .addStringOption((option) =>
            option
                .setName("status")
                .setDescription("Only show rounds with this status")
                .addChoices(
                    { name: "Open", value: RoundStatus.Open },
                    { name: "Closed", value: RoundStatus.Closed },
                    { name: "Finalized", value: RoundStatus.Finalized },
                    { name: "Draft", value: RoundStatus.Draft }
                )
        )
        .toJSON(),
    async execute(interaction: ChatInputCommandInteraction, context: BotContext): Promise<void> {
        await interaction.deferReply();
        const status = interaction.options.getString("status") as RoundStatus | null;
        const rounds = await actingAs(interaction, context).listRounds(status ?? undefined);
        const payload = roundList(rounds.data);
        await interaction.editReply(asEdit(payload));
    }
};

export const roundCommands: readonly SlashCommand[] = [
    roundsCommand,
    roundCommand("round", "Show a voting round", RoundView.Detail, false),
    roundCommand("entries", "Browse the entries in a round", RoundView.Entries, false),
    roundCommand("leaderboard", "Show live standings for a round", RoundView.Leaderboard, false),
    roundCommand("results", "Show the certified results of a round", RoundView.Results, false, RoundStatus.Finalized),
    roundCommand("telemetry", "Show raid telemetry for a round (moderators)", RoundView.Telemetry, true)
];

export const roundSelectHandler: ComponentHandler = {
    prefix: roundSelectPrefix,
    async handle(interaction: ComponentInteraction, context: BotContext): Promise<void> {
        if (!interaction.isStringSelectMenu()) {
            return;
        }
        const select: StringSelectMenuInteraction = interaction;
        const view = select.customId.split(":")[1] as RoundView;
        const roundId = select.values[0];
        if (!Object.values(RoundView).includes(view) || roundId === undefined || !uuidPattern.test(roundId)) {
            return;
        }
        await select.deferUpdate();
        const payload = await renderRound(view, roundId, select, context);
        await select.editReply(asEdit(payload));
    }
};

export const entryPageHandler: ComponentHandler = {
    prefix: entryPagePrefix,
    async handle(interaction: ComponentInteraction, context: BotContext): Promise<void> {
        if (!interaction.isButton()) {
            return;
        }
        const button: ButtonInteraction = interaction;
        const [, roundId, rawIndex] = button.customId.split(":");
        const index = Number(rawIndex);
        if (roundId === undefined || !uuidPattern.test(roundId) || !Number.isInteger(index) || index < 0) {
            return;
        }
        await button.deferUpdate();
        const api = actingAs(button, context);
        const [round, entries] = await Promise.all([api.getRound(roundId), api.listEntries(roundId)]);
        const payload = entryPage(round, entries, Math.min(index, Math.max(0, entries.length - 1)));
        await button.editReply(asEdit(payload));
    }
};
