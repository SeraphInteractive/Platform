export interface Shelf {
    id: string;
    name: string;
    createdAt: number;
}

export interface ScriptDocument {
    id: string;
    title: string;
    author: string;
    logline?: string;
    content?: any;
    titlePage?: {
        title: string;
        writtenBy: string;
        basedOn: string;
        contact: string;
        draftInfo: string;
    };
    lastModified: number;
    wordCount?: number;
    sceneCount?: number;
    shelfId?: string | null;
    order?: number;
    category?: "mine" | "shared" | "archived";
}
