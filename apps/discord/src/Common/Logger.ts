import { pino, type Logger } from "pino";

export function createLogger(level: string, pretty: boolean): Logger {
    return pino({
        level,
        base: { service: "platform-discord" },
        timestamp: pino.stdTimeFunctions.isoTime,
        redact: { paths: ["*.token", "*.serviceToken", "*.authorization", "headers.authorization"], censor: "[redacted]" },
        ...(pretty
            ? { transport: { target: "pino-pretty", options: { translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname,service" } } }
            : {})
    });
}
