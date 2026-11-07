import { describe, expect, it } from "vitest";
import { EnvironmentError, loadEnvironment } from "../src/Configuration/Environment.js";

const base = {
    APP_URL: "http://localhost:3333",
    APP_KEY: "local-app-key-that-is-at-least-32-characters",
    CORS_ORIGINS: "http://localhost:3000",
    DB_HOST: "localhost",
    DB_USER: "platform",
    DB_PASSWORD: "secret",
    DB_DATABASE: "platform",
    REDIS_HOST: "memory",
    DISCORD_CLIENT_ID: "100000000000000000",
    DISCORD_CLIENT_SECRET: "secret",
    DISCORD_REDIRECT_URI: "http://localhost:3333/api/v1/auth/discord/callback"
};

describe("environment", () => {
    it("allows in-memory state in development", () => {
        expect(loadEnvironment({ ...base, NODE_ENV: "development" }).REDIS_HOST).toBe("memory");
    });

    it("refuses in-memory state in production", () => {
        expect(() => loadEnvironment({ ...base, NODE_ENV: "production" })).toThrow(EnvironmentError);
        try {
            loadEnvironment({ ...base, NODE_ENV: "production" });
        } catch (error: unknown) {
            expect((error as EnvironmentError).issues.some((issue) => issue.startsWith("REDIS_HOST"))).toBe(true);
        }
    });
});
