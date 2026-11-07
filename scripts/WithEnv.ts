import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

process.loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));

const [script, ...args] = process.argv.slice(2);
if (script === undefined) {
    process.stderr.write("Usage: node scripts/WithEnv.ts <script> [...args]\n");
    process.exit(1);
}

const child = spawn(process.execPath, [script, ...args], { stdio: "inherit", env: process.env });
child.on("exit", (code, signal) => {
    process.exit(code ?? (signal === null ? 0 : 1));
});
for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
        child.kill(signal);
    });
}
