import type {
    AddScreenplayCollaboratorDto,
    CreateScreenplayDto,
    CreateScreenplayShelfDto,
    CreateScreenplayVersionDto,
    ScreenplayCollaboratorDto,
    ScreenplayDto,
    ScreenplayShelfDto,
    ScreenplaySummaryDto,
    ScreenplayVersionDto,
    UpdateScreenplayDto
} from "@platform/contracts";

async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const candidateUrls = [`/studio/script/api/scripts${endpoint}`, `/api/scripts${endpoint}`, `/api/v1/scripts${endpoint}`];

    let lastError: Error | null = null;
    for (const url of candidateUrls) {
        try {
            const res = await fetch(url, {
                ...options,
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    ...(options.headers || {})
                }
            });

            if (res.status === 404 && url !== candidateUrls[candidateUrls.length - 1]) {
                continue;
            }

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.detail || errorData.error || errorData.message || `Request failed with status ${res.status}`);
            }

            if (res.status === 204) {
                return null as T;
            }

            const payload = await res.json();
            return (payload && typeof payload === "object" && "data" in payload ? payload.data : payload) as T;
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            if (url === candidateUrls[candidateUrls.length - 1]) {
                throw lastError;
            }
        }
    }

    throw lastError ?? new Error("Request failed.");
}

export const ScriptApiClient = {
    async listScripts(): Promise<ScreenplaySummaryDto[]> {
        return apiRequest<ScreenplaySummaryDto[]>("");
    },

    async getScript(id: string): Promise<ScreenplayDto> {
        return apiRequest<ScreenplayDto>(`/${id}`);
    },

    async createScript(input: CreateScreenplayDto): Promise<ScreenplayDto> {
        return apiRequest<ScreenplayDto>("", {
            method: "POST",
            body: JSON.stringify(input)
        });
    },

    async updateScript(id: string, input: UpdateScreenplayDto): Promise<ScreenplayDto> {
        return apiRequest<ScreenplayDto>(`/${id}`, {
            method: "PATCH",
            body: JSON.stringify(input)
        });
    },

    async deleteScript(id: string): Promise<void> {
        await apiRequest<void>(`/${id}`, {
            method: "DELETE"
        });
    },

    async duplicateScript(id: string): Promise<ScreenplayDto> {
        return apiRequest<ScreenplayDto>(`/${id}/duplicate`, {
            method: "POST"
        });
    },

    async listVersions(scriptId: string): Promise<ScreenplayVersionDto[]> {
        return apiRequest<ScreenplayVersionDto[]>(`/${scriptId}/versions`);
    },

    async createVersion(scriptId: string, input: CreateScreenplayVersionDto): Promise<ScreenplayVersionDto> {
        return apiRequest<ScreenplayVersionDto>(`/${scriptId}/versions`, {
            method: "POST",
            body: JSON.stringify(input)
        });
    },

    async restoreVersion(scriptId: string, versionId: string): Promise<ScreenplayDto> {
        return apiRequest<ScreenplayDto>(`/${scriptId}/versions/${versionId}/restore`, {
            method: "POST"
        });
    },

    async listShelves(): Promise<ScreenplayShelfDto[]> {
        return apiRequest<ScreenplayShelfDto[]>("/shelves");
    },

    async createShelf(input: CreateScreenplayShelfDto): Promise<ScreenplayShelfDto> {
        return apiRequest<ScreenplayShelfDto>("/shelves", {
            method: "POST",
            body: JSON.stringify(input)
        });
    },

    async deleteShelf(id: string): Promise<void> {
        await apiRequest<void>(`/shelves/${id}`, {
            method: "DELETE"
        });
    },

    async addCollaborator(scriptId: string, input: AddScreenplayCollaboratorDto): Promise<ScreenplayCollaboratorDto> {
        return apiRequest<ScreenplayCollaboratorDto>(`/${scriptId}/collaborators`, {
            method: "POST",
            body: JSON.stringify(input)
        });
    },

    async removeCollaborator(scriptId: string, userId: string): Promise<void> {
        await apiRequest<void>(`/${scriptId}/collaborators/${userId}`, {
            method: "DELETE"
        });
    }
};
