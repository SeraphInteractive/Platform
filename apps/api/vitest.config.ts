import { defineProject } from "vitest/config";

export default defineProject({
    test: {
        name: "api",
        include: ["test/**/*.test.ts"],
        environment: "node",
        testTimeout: 30_000,
        hookTimeout: 60_000
    }
});
