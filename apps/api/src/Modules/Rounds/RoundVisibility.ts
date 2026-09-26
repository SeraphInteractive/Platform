import type { AuthenticatedUser } from "../../Common/Security/Principal.js";
import { hasAtLeast, Role } from "../../Domain/Roles.js";

export function canSeeDrafts(viewer: AuthenticatedUser | null): boolean {
    return viewer !== null && hasAtLeast(viewer.role, Role.Moderator);
}
