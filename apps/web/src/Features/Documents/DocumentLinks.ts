import { DocumentSlug } from "@platform/contracts";
import type { Route } from "next";

export const documentPaths: Readonly<Record<DocumentSlug, Route>> = {
    [DocumentSlug.Guidelines]: "/guidelines",
    [DocumentSlug.Rules]: "/rules",
    [DocumentSlug.Terms]: "/legal/terms",
    [DocumentSlug.Privacy]: "/legal/privacy",
    [DocumentSlug.AcceptableUse]: "/legal/acceptable-use"
};

export const documentNames: Readonly<Record<DocumentSlug, string>> = {
    [DocumentSlug.Guidelines]: "Guidelines",
    [DocumentSlug.Rules]: "Discord Rules",
    [DocumentSlug.Terms]: "Terms of Service",
    [DocumentSlug.Privacy]: "Privacy Policy",
    [DocumentSlug.AcceptableUse]: "Acceptable Use Policy"
};

export function editorPath(slug: DocumentSlug): Route {
    return `/studio/content/${slug}` as Route;
}
