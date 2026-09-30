import { Role } from "../../Domain/Roles.js";

export interface AuthenticatedUser {
    readonly id: string;
    readonly discordId: string;
    readonly discordUsername: string;
    readonly role: Role;
    readonly isBlacklisted: boolean;
    readonly termsVersion: string | null;
    readonly isVerified: boolean;
}

export interface UserPrincipal {
    readonly kind: "user";
    readonly user: AuthenticatedUser;
    readonly tokenId: string | null;
    readonly isDelegated: boolean;
}

export interface ServicePrincipal {
    readonly kind: "service";
}

export type Principal = UserPrincipal | ServicePrincipal;

export interface Actor {
    readonly userId: string | null;
    readonly discordId: string | null;
    readonly role: Role;
    readonly displayName: string;
}

export interface UserActor extends Actor {
    readonly userId: string;
    readonly discordId: string;
}

export const serviceActor: Actor = Object.freeze({ userId: null, discordId: null, role: Role.Supervisor, displayName: "Platform service" });

export function actorFor(principal: Principal): Actor {
    if (principal.kind === "service") {
        return serviceActor;
    }
    return userActorFor(principal);
}

export function userActorFor(principal: UserPrincipal): UserActor {
    return {
        userId: principal.user.id,
        discordId: principal.user.discordId,
        role: principal.user.role,
        displayName: principal.user.discordUsername
    };
}

export function actorOfUser(user: AuthenticatedUser): UserActor {
    return { userId: user.id, discordId: user.discordId, role: user.role, displayName: user.discordUsername };
}
