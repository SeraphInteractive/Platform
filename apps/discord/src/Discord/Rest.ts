import type { RESTOptions } from "discord.js";

// bypass node 24 undici symbol headers crash in @discordjs/rest
const makeFetchRequest: NonNullable<RESTOptions["makeRequest"]> = async (url, init) => {
    return fetch(url, init as unknown as RequestInit) as unknown as Awaited<ReturnType<NonNullable<RESTOptions["makeRequest"]>>>;
};

export const discordRestOptions = {
    rest: {
        makeRequest: makeFetchRequest
    }
} as const;

export const discordRest = discordRestOptions.rest;
