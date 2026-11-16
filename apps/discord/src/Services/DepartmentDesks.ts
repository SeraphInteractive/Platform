import type { DepartmentDto } from "@platform/contracts";
import { PermissionFlagsBits, type Role, type TextChannel } from "discord.js";
import type { Logger } from "pino";
import type { PlatformApiClient } from "../Api/PlatformApiClient.js";
import { findStudioRole, StudioTier } from "./StudioRoles.js";

export function departmentStaffRoleIds(department: Pick<DepartmentDto, "supervisorSpecialties">, roles: Iterable<Role>): string[] {
    const staff: string[] = [];
    for (const role of roles) {
        const studioRole = findStudioRole(role.name);
        if (studioRole === undefined) {
            continue;
        }
        const leadsDepartment = studioRole.specialty !== undefined && department.supervisorSpecialties.includes(studioRole.specialty);
        if (leadsDepartment || studioRole.tier === StudioTier.Executive) {
            staff.push(role.id);
        }
    }
    return [...new Set(staff)].slice(0, 25);
}

export async function prepareApplyChannel(channel: TextChannel, botId: string): Promise<void> {
    const reason = "Let applicants talk in their private ticket threads";
    const everyone = channel.guild.roles.everyone;
    const everyoneOv = channel.permissionOverwrites?.cache?.get(everyone.id);
    const everyoneNeedsEdit =
        !everyoneOv ||
        !everyoneOv.allow.has(PermissionFlagsBits.SendMessagesInThreads) ||
        everyoneOv.allow.has(PermissionFlagsBits.ManageThreads);
    if (everyoneNeedsEdit && typeof channel.permissionOverwrites?.edit === "function") {
        await channel.permissionOverwrites
            .edit(
                everyone,
                { SendMessagesInThreads: true, ManageThreads: false, CreatePublicThreads: false, CreatePrivateThreads: false },
                { reason }
            )
            .catch(() => undefined);
    }
    const botOv = channel.permissionOverwrites?.cache?.get(botId);
    const botNeedsEdit =
        !botOv || !botOv.allow.has(PermissionFlagsBits.SendMessagesInThreads) || !botOv.allow.has(PermissionFlagsBits.CreatePrivateThreads);
    if (botNeedsEdit && typeof channel.permissionOverwrites?.edit === "function") {
        await channel.permissionOverwrites
            .edit(
                botId,
                {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true,
                    SendMessagesInThreads: true,
                    CreatePrivateThreads: true,
                    ManageThreads: true,
                    ManageWebhooks: true
                },
                { reason }
            )
            .catch(() => undefined);
    }
}

export async function setUpDepartmentDesk(
    api: PlatformApiClient,
    department: Pick<DepartmentDto, "id" | "name" | "supervisorSpecialties">,
    applyChannel: TextChannel,
    logsChannelId: string | null,
    roles: Iterable<Role>,
    logger: Logger
): Promise<void> {
    try {
        await prepareApplyChannel(applyChannel, applyChannel.client.user.id);
    } catch (error: unknown) {
        logger.warn({ err: error, department: department.id }, "could not adjust apply channel permissions for tickets");
    }
    try {
        await api.ensureDepartmentDesk(department.id, {
            departmentName: department.name,
            applyChannelId: applyChannel.id,
            notificationChannelId: logsChannelId,
            staffRoleIds: departmentStaffRoleIds(department, roles)
        });
    } catch (error: unknown) {
        logger.warn({ err: error, department: department.id }, "failed to set up the department ticket desk");
    }
}
