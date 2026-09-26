import { pino, type Logger } from "pino";

export function createLogger(level: string, pretty: boolean): Logger {
    return pino({
        level,
        base: { service: "platform-api" },
        timestamp: pino.stdTimeFunctions.isoTime,
        redact: {
            paths: [
                "req.headers.authorization",
                "req.headers.cookie",
                'res.headers["set-cookie"]',
                "headers.authorization",
                "*.token",
                "*.password",
                "*.secret"
            ],
            censor: "[redacted]"
        },
        serializers: {
            req: (request: { method?: string; url?: string; id?: string }) => ({
                method: request.method,
                url: request.url?.split("?")[0],
                id: request.id
            })
        },
        ...(pretty
            ? { transport: { target: "pino-pretty", options: { translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname,service" } } }
            : {})
    });
}
