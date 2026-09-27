import type { NotificationPerson } from "@platform/contracts";
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    escapeMarkdown,
    MediaGalleryBuilder,
    MessageFlags,
    SeparatorBuilder,
    SeparatorSpacingSize,
    TextDisplayBuilder,
    type MessageActionRowComponentBuilder
} from "discord.js";

export enum Accent {
    Neutral = 0x4f545c,
    Info = 0x3b82f6,
    Success = 0x22a55b,
    Warning = 0xe0a030,
    Danger = 0xd83c3e
}

export type Block = string | SeparatorBuilder | MediaGalleryBuilder | ActionRowBuilder<MessageActionRowComponentBuilder> | null | undefined;

export type TopLevelComponent = ContainerBuilder | TextDisplayBuilder | ActionRowBuilder<MessageActionRowComponentBuilder>;

export interface V2Message {
    readonly flags: number;
    readonly components: TopLevelComponent[];
    readonly allowedMentions: { readonly parse: [] };
}

const textDisplayLimit = 4000;

const markdownEscapes = { heading: true, bulletedList: true, numberedList: true, maskedLink: true } as const;

export function text(content: string): TextDisplayBuilder {
    const trimmed = content.length > textDisplayLimit ? `${content.slice(0, textDisplayLimit - 1)}…` : content;
    return new TextDisplayBuilder().setContent(trimmed);
}

export function divider(): SeparatorBuilder {
    return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
}

export function panel(accent: Accent | null, ...blocks: readonly Block[]): ContainerBuilder {
    const container = new ContainerBuilder();
    if (accent !== null) {
        container.setAccentColor(accent);
    }
    for (const block of blocks) {
        if (block === null || block === undefined) {
            continue;
        }
        if (typeof block === "string") {
            container.addTextDisplayComponents(text(block));
        } else if (block instanceof SeparatorBuilder) {
            container.addSeparatorComponents(block);
        } else if (block instanceof MediaGalleryBuilder) {
            container.addMediaGalleryComponents(block);
        } else {
            container.addActionRowComponents(block);
        }
    }
    return container;
}

export function message(...components: readonly TopLevelComponent[]): V2Message {
    return { flags: MessageFlags.IsComponentsV2, components: [...components], allowedMentions: { parse: [] } };
}

export function ephemeral(...components: readonly TopLevelComponent[]): V2Message {
    return { flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components: [...components], allowedMentions: { parse: [] } };
}

export function notice(content: string, accent: Accent | null = null): V2Message {
    return ephemeral(panel(accent, content));
}

export function buttons(...items: readonly ButtonBuilder[]): ActionRowBuilder<MessageActionRowComponentBuilder> {
    return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...items);
}

export function linkButton(label: string, url: string): ButtonBuilder {
    return new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(label).setURL(url);
}

export function actionButton(customId: string, label: string, style: ButtonStyle = ButtonStyle.Secondary, disabled = false): ButtonBuilder {
    return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style).setDisabled(disabled);
}

export function image(url: string, description?: string): MediaGalleryBuilder {
    return new MediaGalleryBuilder().addItems((item) => {
        item.setURL(url);
        if (description !== undefined) {
            item.setDescription(description.slice(0, 1024));
        }
        return item;
    });
}

export function plain(value: string, maximumLength = 256): string {
    const collapsed = value.replace(/[\r\n]+/gu, " ").trim();
    const shortened = collapsed.length > maximumLength ? `${collapsed.slice(0, maximumLength - 1)}…` : collapsed;
    return escapeMarkdown(shortened, markdownEscapes)
        .replace(/@/gu, "@​")
        .replace(/<(?=[@#:&])/gu, "<​");
}

export function quote(value: string, maximumLength = 1000): string {
    const shortened = value.length > maximumLength ? `${value.slice(0, maximumLength - 1)}…` : value;
    return shortened
        .split(/\r?\n/u)
        .map(
            (line) =>
                `> ${escapeMarkdown(line, markdownEscapes)
                    .replace(/@/gu, "@​")
                    .replace(/<(?=[@#:&])/gu, "<​")}`
        )
        .join("\n");
}

export function person(value: NotificationPerson): string {
    return value.discordId === null ? plain(value.username, 64) : `<@${value.discordId}>`;
}

export function when(iso: string, style: "R" | "f" | "F" | "D" | "d" = "R"): string {
    return `<t:${Math.floor(new Date(iso).getTime() / 1000)}:${style}>`;
}

export function pluralize(count: number, singular: string, pluralForm = `${singular}s`): string {
    return `${count.toLocaleString("en-US")} ${count === 1 ? singular : pluralForm}`;
}

export function capitalize(value: string): string {
    return value.length === 0 ? value : `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;
}

export function humanize(value: string): string {
    return capitalize(value.replace(/_/gu, " "));
}

export function truncate(value: string, maximumLength: number): string {
    const collapsed = value.replace(/[\r\n]+/gu, " ").trim();
    return collapsed.length > maximumLength ? `${collapsed.slice(0, maximumLength - 1)}…` : collapsed;
}

export function asEdit(payload: V2Message): {
    components: TopLevelComponent[];
    flags: MessageFlags.IsComponentsV2;
    allowedMentions: { parse: [] };
} {
    return { components: payload.components, flags: MessageFlags.IsComponentsV2, allowedMentions: payload.allowedMentions };
}
