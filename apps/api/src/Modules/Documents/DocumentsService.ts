import { initialTermsVersion, legalDocumentSlugs, type DocumentSectionDto, type DocumentSlug } from "@platform/contracts";
import { and, desc, eq, inArray, max } from "drizzle-orm";
import { BadRequestError, ConflictError, ErrorCode, NotFoundError } from "../../Common/Errors/ApplicationError.js";
import type { UserActor } from "../../Common/Security/Principal.js";
import type { Database } from "../../Infrastructure/Database/Database.js";
import {
    documentRevisions,
    documents,
    users,
    type DocumentRecord,
    type DocumentRevisionRecord,
    type StoredDocumentSection,
    type UserRecord
} from "../../Infrastructure/Database/Schema.js";
import { defaultDocuments } from "./DefaultDocuments.js";
import { sanitizeDocumentHtml } from "./DocumentSanitizer.js";

type Author = Pick<UserRecord, "id" | "discordId" | "discordUsername" | "discordAvatar">;

export interface DocumentView {
    readonly slug: DocumentSlug;
    readonly title: string;
    readonly sections: readonly StoredDocumentSection[];
    readonly revision: number;
    readonly updatedAt: Date | null;
    readonly updatedBy: Author | null;
}

export interface RevisionView {
    readonly record: DocumentRevisionRecord;
    readonly author: Author | null;
}

export interface DocumentUpdate {
    readonly title: string;
    readonly sections: readonly DocumentSectionDto[];
    readonly expectedRevision: number;
    readonly requireReacceptance: boolean;
    readonly note: string | null;
}

export interface LegalAcceptance {
    currentAcceptanceVersion(): Promise<string>;
}

const acceptanceCacheMs = 15_000;

const authorColumns = {
    id: users.id,
    discordId: users.discordId,
    discordUsername: users.discordUsername,
    discordAvatar: users.discordAvatar
};

export function isLegalDocument(slug: DocumentSlug): boolean {
    return legalDocumentSlugs.includes(slug);
}

export class DocumentsService implements LegalAcceptance {
    private cachedAcceptance: { readonly version: string; readonly expiresAt: number } | null = null;

    public constructor(private readonly database: Database) {}

    public async get(slug: DocumentSlug): Promise<DocumentView> {
        const [row] = await this.database
            .select({ document: documents, author: authorColumns })
            .from(documents)
            .leftJoin(users, eq(users.id, documents.updatedBy))
            .where(eq(documents.slug, slug))
            .limit(1);
        if (row === undefined) {
            const fallback = defaultDocuments[slug];
            return { slug, title: fallback.title, sections: fallback.sections, revision: 0, updatedAt: null, updatedBy: null };
        }
        return this.toView(row.document, row.author);
    }

    public async currentAcceptanceVersion(): Promise<string> {
        const now = Date.now();
        if (this.cachedAcceptance !== null && this.cachedAcceptance.expiresAt > now) {
            return this.cachedAcceptance.version;
        }
        const [row] = await this.database
            .select({ version: max(documents.acceptanceVersion) })
            .from(documents)
            .where(inArray(documents.slug, [...legalDocumentSlugs]));
        const version = row?.version ?? initialTermsVersion;
        this.cachedAcceptance = { version, expiresAt: now + acceptanceCacheMs };
        return version;
    }

    public async publish(actor: UserActor, slug: DocumentSlug, update: DocumentUpdate): Promise<DocumentView> {
        const sections = this.prepareSections(update.sections);
        if (update.requireReacceptance && !isLegalDocument(slug)) {
            throw new BadRequestError("Only legal documents can require re-acceptance.", ErrorCode.ValidationFailed);
        }
        const published = await this.database.transaction(async (transaction) => {
            const [current] = await transaction.select().from(documents).where(eq(documents.slug, slug)).limit(1).for("update");
            const currentRevision = current?.revision ?? 0;
            if (update.expectedRevision !== currentRevision) {
                throw new ConflictError("Someone else published this document while you were editing. Reload to see their changes.");
            }
            const revision = currentRevision + 1;
            const acceptanceVersion = update.requireReacceptance ? new Date().toISOString() : (current?.acceptanceVersion ?? null);
            const values = { title: update.title, sections, revision, acceptanceVersion, updatedBy: actor.userId };
            const [saved] = await transaction
                .insert(documents)
                .values({ slug, ...values })
                .onConflictDoUpdate({ target: documents.slug, set: { ...values, updatedAt: new Date() } })
                .returning();
            await transaction.insert(documentRevisions).values({
                slug,
                revision,
                title: update.title,
                sections,
                requiresReacceptance: update.requireReacceptance,
                note: update.note,
                authorId: actor.userId
            });
            if (saved === undefined) {
                throw new Error("Document upsert returned no row.");
            }
            return saved;
        });
        if (update.requireReacceptance) {
            this.cachedAcceptance = null;
        }
        const [author] = await this.database.select(authorColumns).from(users).where(eq(users.id, actor.userId)).limit(1);
        return this.toView(published, author ?? null);
    }

    public async revisions(slug: DocumentSlug): Promise<RevisionView[]> {
        const rows = await this.database
            .select({ record: documentRevisions, author: authorColumns })
            .from(documentRevisions)
            .leftJoin(users, eq(users.id, documentRevisions.authorId))
            .where(eq(documentRevisions.slug, slug))
            .orderBy(desc(documentRevisions.revision))
            .limit(100);
        return rows.map((row) => ({ record: row.record, author: row.author }));
    }

    public async revision(slug: DocumentSlug, revision: number): Promise<RevisionView> {
        const [row] = await this.database
            .select({ record: documentRevisions, author: authorColumns })
            .from(documentRevisions)
            .leftJoin(users, eq(users.id, documentRevisions.authorId))
            .where(and(eq(documentRevisions.slug, slug), eq(documentRevisions.revision, revision)))
            .limit(1);
        if (row === undefined) {
            throw new NotFoundError("Revision");
        }
        return { record: row.record, author: row.author };
    }

    private prepareSections(sections: readonly DocumentSectionDto[]): StoredDocumentSection[] {
        const seen = new Set<string>();
        return sections.map((section) => {
            if (seen.has(section.id)) {
                throw new BadRequestError(`Two sections share the anchor "${section.id}". Rename one of them.`, ErrorCode.ValidationFailed);
            }
            seen.add(section.id);
            return { id: section.id, title: section.title.trim(), html: sanitizeDocumentHtml(section.html) };
        });
    }

    private toView(document: DocumentRecord, author: Author | null): DocumentView {
        return {
            slug: document.slug as DocumentSlug,
            title: document.title,
            sections: document.sections,
            revision: document.revision,
            updatedAt: document.updatedAt,
            updatedBy: author
        };
    }
}
