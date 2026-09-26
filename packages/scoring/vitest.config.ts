import { defineProject } from "vitest/config";

export default defineProject({
    test: {
        name: "scoring",
        include: ["test/**/*.test.ts"],
        environment: "node"
    }
});
