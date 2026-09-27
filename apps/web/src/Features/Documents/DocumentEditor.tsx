"use client";

import {
    documentLimits,
    fieldRules,
    problemOf,
    textLimits,
    legalDocumentSlugs,
    Role,
    type DocumentDto,
    type DocumentRevisionSummaryDto,
    type DocumentSectionDto,
    type DocumentSlug
} from "@platform/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Eye, History, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { describeError } from "@/Api/ApiClient";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { ConfirmButton } from "@/Components/Common/ConfirmButton";
import { PageHeader } from "@/Components/Common/PageHeader";
import { RelativeTime } from "@/Components/Common/RelativeTime";
import { ErrorState, LoadingRows, RequireRole } from "@/Components/Common/States";
import { Button } from "@/Components/Ui/button";
import { Checkbox } from "@/Components/Ui/checkbox";
import { Input } from "@/Components/Ui/input";
import { Label } from "@/Components/Ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/Components/Ui/sheet";
import { Textarea } from "@/Components/Ui/textarea";
import { cn } from "@/Lib/Utils";
import { documentNames, documentPaths } from "./DocumentLinks";
import { DocumentSections } from "./DocumentView";
import { RichTextEditor } from "./RichTextEditor";

interface DraftSection {
    readonly key: string;
    readonly id: string;
    readonly title: string;
    readonly html: string;
}

interface Draft {
    readonly title: string;
    readonly sections: readonly DraftSection[];
}

function toDraft(source: Pick<DocumentDto, "title" | "sections">): Draft {
    return { title: source.title, sections: source.sections.map((section) => ({ ...section, key: crypto.randomUUID() })) };
}

function anchorFor(title: string): string {
    const anchor = title
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9]+/gu, "-")
        .replace(/^-+|-+$/gu, "")
        .slice(0, documentLimits.sectionIdLength - 4)
        .replace(/-+$/u, "");
    return anchor.length === 0 ? "section" : anchor;
}

function toSections(draft: Draft): DocumentSectionDto[] {
    const used = new Set<string>();
    return draft.sections.map((section) => {
        const base = section.id.length > 0 ? section.id : anchorFor(section.title);
        let id = base;
        for (let suffix = 2; used.has(id); suffix++) {
            id = `${base}-${suffix}`;
        }
        used.add(id);
        return { id, title: section.title.trim(), html: section.html };
    });
}

function sectionTitleProblem(section: DraftSection): string | null {
    return problemOf(fieldRules.sectionTitle, section.title);
}

function sectionBodyProblem(section: DraftSection): string | null {
    return section.html.length > documentLimits.sectionHtmlLength ? "This section is too long. Split it up." : null;
}

function problemWith(draft: Draft, note: string): string | null {
    const title = problemOf(fieldRules.documentTitle, draft.title);
    if (title !== null) {
        return `Document title: ${title}`;
    }
    if (draft.sections.length === 0) {
        return "Add at least one section.";
    }
    if (draft.sections.length > documentLimits.sections) {
        return `Keep it to ${documentLimits.sections} sections or fewer.`;
    }
    for (const [index, section] of draft.sections.entries()) {
        const problem = sectionTitleProblem(section) ?? sectionBodyProblem(section);
        if (problem !== null) {
            return `Section ${index + 1}: ${problem}`;
        }
    }
    return problemOf(fieldRules.documentNote, note);
}

interface SectionCardProps {
    readonly section: DraftSection;
    readonly index: number;
    readonly count: number;
    readonly version: number;
    readonly onChange: (section: DraftSection) => void;
    readonly onMove: (offset: number) => void;
    readonly onRemove: () => void;
    readonly onInsertAfter: () => void;
}

function SectionCard({ section, index, count, version, onChange, onMove, onRemove, onInsertAfter }: SectionCardProps): ReactNode {
    const titleId = useId();
    return (
        <div className="space-y-2">
            <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                    <Label htmlFor={titleId} className="text-muted-foreground text-xs">
                        Section {index + 1}
                    </Label>
                    <Input
                        id={titleId}
                        value={section.title}
                        maxLength={textLimits.sectionTitle}
                        placeholder="Section title"
                        aria-invalid={
                            (sectionTitleProblem(section) !== null && (section.title.length > 0 || section.html.length > 0)) || undefined
                        }
                        className="font-medium"
                        onChange={(event) => {
                            onChange({ ...section, title: event.target.value });
                        }}
                    />
                </div>
                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="Move up"
                    disabled={index === 0}
                    onClick={() => {
                        onMove(-1);
                    }}
                >
                    <ArrowUp />
                </Button>
                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="Move down"
                    disabled={index === count - 1}
                    onClick={() => {
                        onMove(1);
                    }}
                >
                    <ArrowDown />
                </Button>
                <ConfirmButton
                    title={`Delete "${section.title || "this section"}"?`}
                    description="The section is removed from your draft. Nothing changes until you publish."
                    confirmLabel="Delete"
                    destructive
                    size="icon"
                    variant="ghost"
                    disabled={count === 1}
                    onConfirm={onRemove}
                >
                    <Trash2 />
                </ConfirmButton>
            </div>
            <RichTextEditor
                key={`${section.key}:${version}`}
                value={section.html}
                label={`${section.title || "Section"} content`}
                invalid={sectionBodyProblem(section) !== null}
                onChange={(html) => {
                    onChange({ ...section, html });
                }}
            />
            <div className="flex justify-center pt-1">
                <Button type="button" size="xs" variant="ghost" className="text-muted-foreground" onClick={onInsertAfter}>
                    <Plus />
                    Add section
                </Button>
            </div>
        </div>
    );
}

interface RevisionHistoryProps {
    readonly slug: DocumentSlug;
    readonly current: number;
    readonly isDirty: boolean;
    readonly onLoad: (draft: Draft, revision: number) => void;
}

function RevisionHistory({ slug, current, isDirty, onLoad }: RevisionHistoryProps): ReactNode {
    const [open, setOpen] = useState(false);
    const revisions = useQuery({
        queryKey: queryKeys.documentRevisions(slug),
        queryFn: () => platformApi.documentRevisions(slug),
        enabled: open
    });
    const load = useMutation({
        mutationFn: (revision: number) => platformApi.documentRevision(slug, revision),
        onSuccess: (revision) => {
            onLoad(toDraft(revision), revision.revision);
            setOpen(false);
            toast.success(`Revision ${revision.revision} loaded. Publish to restore it.`);
        },
        onError: (error) => {
            toast.error(describeError(error));
        }
    });

    const row = (item: DocumentRevisionSummaryDto): ReactNode => (
        <li key={item.revision} className="space-y-1 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">
                    Revision {item.revision}
                    {item.revision === current && <span className="text-muted-foreground font-normal"> · current</span>}
                </p>
                {item.revision !== current &&
                    (isDirty ? (
                        <ConfirmButton
                            title="Replace your draft?"
                            description="Your unpublished changes will be lost."
                            confirmLabel="Load"
                            size="xs"
                            disabled={load.isPending}
                            onConfirm={() => {
                                load.mutate(item.revision);
                            }}
                        >
                            Load
                        </ConfirmButton>
                    ) : (
                        <Button
                            size="xs"
                            variant="outline"
                            disabled={load.isPending}
                            onClick={() => {
                                load.mutate(item.revision);
                            }}
                        >
                            Load
                        </Button>
                    ))}
            </div>
            <p className="text-muted-foreground text-xs">
                {item.author?.username ?? "Unknown"} · <RelativeTime value={item.createdAt} />
                {item.requiresReacceptance && " · required re-acceptance"}
            </p>
            {item.note !== null && item.note.length > 0 && <p className="text-xs">{item.note}</p>}
        </li>
    );

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button size="sm" variant="outline">
                    <History />
                    History
                </Button>
            </SheetTrigger>
            <SheetContent className="w-full gap-0 sm:max-w-md">
                <SheetHeader className="border-b">
                    <SheetTitle>History</SheetTitle>
                    <SheetDescription>Load an earlier revision into the editor, then publish to restore it.</SheetDescription>
                </SheetHeader>
                <div className="flex-1 overflow-y-auto">
                    {revisions.isPending ? (
                        <div className="p-4">
                            <LoadingRows rows={4} />
                        </div>
                    ) : revisions.isError ? (
                        <div className="p-4">
                            <ErrorState error={revisions.error} onRetry={() => void revisions.refetch()} />
                        </div>
                    ) : revisions.data.length === 0 ? (
                        <p className="text-muted-foreground p-4 text-sm">Not published yet. You&apos;re editing the built-in default.</p>
                    ) : (
                        <ul className="divide-y">{revisions.data.map(row)}</ul>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}

function Editor({ document }: { readonly document: DocumentDto }): ReactNode {
    const queryClient = useQueryClient();
    const titleId = useId();
    const noteId = useId();
    const isLegal = legalDocumentSlugs.includes(document.slug);
    const [baseline, setBaseline] = useState(() => JSON.stringify(toSections(toDraft(document))) + document.title);
    const [draft, setDraft] = useState<Draft>(() => toDraft(document));
    const [version, setVersion] = useState(0);
    const [revision, setRevision] = useState(document.revision);
    const [note, setNote] = useState("");
    const [requireReacceptance, setRequireReacceptance] = useState(false);
    const [previewing, setPreviewing] = useState(false);

    const sections = useMemo(() => toSections(draft), [draft]);
    const isDirty = JSON.stringify(sections) + draft.title !== baseline;
    const problem = problemWith(draft, note);
    const titleProblem = problemOf(fieldRules.documentTitle, draft.title);

    useEffect(() => {
        if (!isDirty) {
            return;
        }
        const warn = (event: BeforeUnloadEvent): void => {
            event.preventDefault();
        };
        window.addEventListener("beforeunload", warn);
        return () => {
            window.removeEventListener("beforeunload", warn);
        };
    }, [isDirty]);

    const publish = useMutation({
        mutationFn: () =>
            platformApi.publishDocument(document.slug, {
                title: draft.title.trim(),
                sections,
                expectedRevision: revision,
                requireReacceptance: isLegal && requireReacceptance,
                note: note.trim().length === 0 ? null : note.trim()
            }),
        onSuccess: (published) => {
            queryClient.setQueryData(queryKeys.document(document.slug), published);
            void queryClient.invalidateQueries({ queryKey: queryKeys.documentRevisions(document.slug) });
            if (requireReacceptance) {
                void queryClient.invalidateQueries({ queryKey: queryKeys.legalAcceptance });
            }
            const next = toDraft(published);
            setDraft(next);
            setBaseline(JSON.stringify(toSections(next)) + published.title);
            setVersion((current) => current + 1);
            setRevision(published.revision);
            setNote("");
            setRequireReacceptance(false);
            toast.success(`Published revision ${published.revision}.`);
        },
        onError: (error) => {
            toast.error(describeError(error));
        }
    });

    const updateSections = (update: (current: readonly DraftSection[]) => DraftSection[]): void => {
        setDraft((current) => ({ ...current, sections: update(current.sections) }));
    };
    const blank = (): DraftSection => ({ key: crypto.randomUUID(), id: "", title: "", html: "" });

    return (
        <>
            <PageHeader
                title={`Edit ${documentNames[document.slug]}`}
                description={
                    <>
                        {revision === 0 ? "Not published yet" : `Revision ${revision}`}
                        {isDirty && " · unpublished changes"}
                    </>
                }
                actions={
                    <>
                        <Button asChild size="sm" variant="ghost">
                            <Link href={documentPaths[document.slug]}>View page</Link>
                        </Button>
                        <RevisionHistory
                            slug={document.slug}
                            current={revision}
                            isDirty={isDirty}
                            onLoad={(loaded) => {
                                setDraft(loaded);
                                setVersion((current) => current + 1);
                                setPreviewing(false);
                            }}
                        />
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                                setPreviewing((current) => !current);
                            }}
                        >
                            {previewing ? <Pencil /> : <Eye />}
                            {previewing ? "Edit" : "Preview"}
                        </Button>
                    </>
                }
            />
            <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_18rem]">
                <div className="min-w-0 space-y-6">
                    {previewing ? (
                        <div className="border p-6">
                            <h1 className="mb-8 text-lg font-semibold">{draft.title}</h1>
                            <DocumentSections document={{ sections }} />
                        </div>
                    ) : (
                        <>
                            <div className="space-y-1">
                                <Label htmlFor={titleId} className="text-muted-foreground text-xs">
                                    Document title
                                </Label>
                                <Input
                                    id={titleId}
                                    value={draft.title}
                                    maxLength={textLimits.documentTitle}
                                    aria-invalid={titleProblem !== null || undefined}
                                    className="text-base font-semibold"
                                    onChange={(event) => {
                                        setDraft((current) => ({ ...current, title: event.target.value }));
                                    }}
                                />
                            </div>
                            {draft.sections.map((section, index) => (
                                <SectionCard
                                    key={section.key}
                                    section={section}
                                    index={index}
                                    count={draft.sections.length}
                                    version={version}
                                    onChange={(next) => {
                                        updateSections((current) => current.map((item) => (item.key === next.key ? next : item)));
                                    }}
                                    onMove={(offset) => {
                                        updateSections((current) => {
                                            const next = [...current];
                                            const [moved] = next.splice(index, 1);
                                            if (moved !== undefined) {
                                                next.splice(index + offset, 0, moved);
                                            }
                                            return next;
                                        });
                                    }}
                                    onRemove={() => {
                                        updateSections((current) => current.filter((item) => item.key !== section.key));
                                    }}
                                    onInsertAfter={() => {
                                        updateSections((current) => [...current.slice(0, index + 1), blank(), ...current.slice(index + 1)]);
                                    }}
                                />
                            ))}
                        </>
                    )}
                </div>
                <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
                    <div className="space-y-4 border p-4">
                        <p className="text-sm font-medium">Publish</p>
                        <div className="space-y-1">
                            <Label htmlFor={noteId} className="text-muted-foreground text-xs">
                                What changed (optional)
                            </Label>
                            <Textarea
                                id={noteId}
                                rows={3}
                                maxLength={textLimits.documentNote}
                                value={note}
                                onChange={(event) => {
                                    setNote(event.target.value);
                                }}
                            />
                        </div>
                        {isLegal && (
                            <label className="flex cursor-pointer items-start gap-2 text-sm">
                                <Checkbox
                                    className="mt-0.5"
                                    checked={requireReacceptance}
                                    onCheckedChange={(value) => {
                                        setRequireReacceptance(value === true);
                                    }}
                                />
                                <span>
                                    Ask everyone to accept again
                                    <span className="text-muted-foreground block text-xs">
                                        Use for material changes. Users can&apos;t vote until they accept.
                                    </span>
                                </span>
                            </label>
                        )}
                        {problem !== null && isDirty && <p className="text-destructive text-xs">{problem}</p>}
                        <Button
                            className={cn("w-full")}
                            disabled={!isDirty || problem !== null || publish.isPending}
                            onClick={() => {
                                publish.mutate();
                            }}
                        >
                            {publish.isPending ? "Publishing…" : "Publish"}
                        </Button>
                    </div>
                    {!previewing && (
                        <Button
                            variant="outline"
                            className="w-full"
                            disabled={draft.sections.length >= documentLimits.sections}
                            onClick={() => {
                                updateSections((current) => [...current, blank()]);
                            }}
                        >
                            <Plus />
                            Add section at end
                        </Button>
                    )}
                </aside>
            </div>
        </>
    );
}

function EditorLoader({ slug }: { readonly slug: DocumentSlug }): ReactNode {
    const document = useQuery({
        queryKey: queryKeys.document(slug),
        queryFn: () => platformApi.document(slug),
        refetchOnWindowFocus: false,
        staleTime: Infinity
    });
    if (document.isPending) {
        return <LoadingRows rows={8} />;
    }
    if (document.isError) {
        return <ErrorState error={document.error} onRetry={() => void document.refetch()} />;
    }
    return <Editor document={document.data} />;
}

export function DocumentEditor({ slug }: { readonly slug: DocumentSlug }): ReactNode {
    return (
        <RequireRole role={Role.SuperAdmin}>
            <EditorLoader slug={slug} />
        </RequireRole>
    );
}
