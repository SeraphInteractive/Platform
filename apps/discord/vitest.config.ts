import { defineProject } from "vitest/config";

export default defineProject({
    test: {
        name: "discord",
        include: ["test/**/*.test.ts"],
        environment: "node"
    }
});
