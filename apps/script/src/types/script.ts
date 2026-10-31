export interface Shelf {
    id: string;
    name: string;
    createdAt: number;
}

export interface TitlePageData {
    title: string;
    author: string;
    writtenBy?: string;
    basedOn?: string;
    contact?: string;
    draftInfo?: string;
}

export interface ScriptDocument {
    id: string;
    title: string;
    author: string;
    logline?: string;
    content?: any;
    titlePage?: TitlePageData;
    lastModified: number;
    wordCount?: number;
    sceneCount?: number;
    shelfId?: string | null;
    order?: number;
    category?: "mine" | "shared" | "archived";
}
