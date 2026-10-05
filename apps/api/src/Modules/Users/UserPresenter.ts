import {
    moderatedUserSchema,
    userSchema,
    userSummarySchema,
    type ModeratedUserDto,
    type UserDto,
    type UserSummaryDto
} from "@platform/contracts";
import { toIso } from "../../Common/Http/Schemas.js";
import type { UserRecord } from "../../Infrastructure/Database/Schema.js";

export { moderatedUserSchema, userSchema, userSummarySchema };

export function avatarUrlOf(discordId: string, avatar: string | null): string | null {
    if (avatar === null || !/^(?:a_)?[a-f0-9]{32}$/u.test(avatar)) {
        return null;
    }
    const extension = avatar.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.${extension}`;
}

export function toUserResponse(user: UserRecord): UserDto {
    return {
        id: user.id,
        discordId: user.discordId,
        username: user.discordUsername,
        avatarUrl: avatarUrlOf(user.discordId, user.discordAvatar),
        role: user.role,
        specialties: user.specialties,
        isBlacklisted: user.isBlacklisted,
        isOnboarded: user.onboardedAt !== null,
        termsVersion: user.termsVersion,
        isVerified: user.emailVerifiedAt !== null,
        createdAt: toIso(user.createdAt)
    };
}

export function toModeratedUserResponse(user: UserRecord): ModeratedUserDto {
    return {
        ...toUserResponse(user),
        blacklistReason: user.blacklistReason,
        blacklistedAt: toIso(user.blacklistedAt)
    };
}

export function toUserSummary(user: {
    readonly id: string;
    readonly discordId: string | null;
    readonly discordUsername: string;
    readonly discordAvatar: string | null;
}): UserSummaryDto {
    return {
        id: user.id,
        username: user.discordUsername,
        avatarUrl: user.discordId !== null ? avatarUrlOf(user.discordId, user.discordAvatar) : null
    };
}
