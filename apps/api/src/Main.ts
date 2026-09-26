import { buildApplication } from "./App.js";
import { createLogger } from "./Common/Logging/Logger.js";
import { createConfiguration } from "./Configuration/ApplicationConfiguration.js";
import { EnvironmentError, loadEnvironment } from "./Configuration/Environment.js";
import { createProductionInfrastructure } from "./Composition/ProductionInfrastructure.js";
import { createServiceContainer } from "./Composition/ServiceContainer.js";
import { MaintenanceScheduler } from "./Jobs/MaintenanceScheduler.js";

const shutdownTimeoutMs = 20_000;

async function main(): Promise<void> {
    const configuration = createConfiguration(loadEnvironment());
    const logger = createLogger(configuration.server.logLevel, configuration.server.logFormat === "pretty");
    const services = createServiceContainer(configuration, createProductionInfrastructure(configuration, logger), logger);
    const application = await buildApplication(services, logger);
    const scheduler = new MaintenanceScheduler(services.shotsService, services.tokenService, services.keyValueStore, logger);

    let shuttingDown = false;
    const shutdown = async (signal: string): Promise<void> => {
        if (shuttingDown) {
            return;
        }
        shuttingDown = true;
        logger.info({ signal }, "shutting down");
        const forceExit = setTimeout(() => {
            logger.error("graceful shutdown timed out");
            process.exit(1);
        }, shutdownTimeoutMs);
        forceExit.unref();
        try {
            scheduler.stop();
            await application.close();
            await services.dispose();
            process.exit(0);
        } catch (error: unknown) {
            logger.error({ err: error }, "shutdown failed");
            process.exit(1);
        }
    };

    process.once("SIGTERM", () => void shutdown("SIGTERM"));
    process.once("SIGINT", () => void shutdown("SIGINT"));
    process.on("unhandledRejection", (reason: unknown) => {
        logger.error({ err: reason }, "unhandled promise rejection");
    });

    await application.listen({ host: configuration.server.host, port: configuration.server.port });
    scheduler.start();
}

main().catch((error: unknown) => {
    if (error instanceof EnvironmentError) {
        process.stderr.write(`${error.message}\n`);
    } else {
        process.stderr.write(`Fatal startup error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    }
    process.exit(1);
});
