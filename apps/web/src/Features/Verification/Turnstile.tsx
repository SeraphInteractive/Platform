"use client";

import { useEffect, useRef, type ReactNode } from "react";

interface TurnstileOptions {
    readonly sitekey: string;
    readonly action: string;
    readonly theme: "auto";
    readonly callback: (token: string) => void;
    readonly "expired-callback": () => void;
    readonly "error-callback": () => void;
}

interface TurnstileApi {
    render(container: HTMLElement, options: TurnstileOptions): string;
    remove(widgetId: string): void;
}

declare global {
    interface Window {
        turnstile?: TurnstileApi;
    }
}

const scriptUrl = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
    if (window.turnstile !== undefined) {
        return Promise.resolve(window.turnstile);
    }
    loading ??= new Promise<TurnstileApi>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = scriptUrl;
        script.async = true;
        script.onload = () => {
            if (window.turnstile === undefined) {
                reject(new Error("Turnstile failed to load."));
            } else {
                resolve(window.turnstile);
            }
        };
        script.onerror = () => {
            loading = null;
            reject(new Error("Turnstile failed to load."));
        };
        document.head.appendChild(script);
    });
    return loading;
}

interface TurnstileProps {
    readonly siteKey: string;
    readonly action: string;
    readonly onToken: (token: string | null) => void;
}

export function Turnstile({ siteKey, action, onToken }: TurnstileProps): ReactNode {
    const container = useRef<HTMLDivElement>(null);
    const callback = useRef(onToken);

    useEffect(() => {
        callback.current = onToken;
    }, [onToken]);

    useEffect(() => {
        let widgetId: string | null = null;
        let cancelled = false;
        loadTurnstile()
            .then((turnstile) => {
                if (cancelled || container.current === null) {
                    return;
                }
                widgetId = turnstile.render(container.current, {
                    sitekey: siteKey,
                    action,
                    theme: "auto",
                    callback: (token) => {
                        callback.current(token);
                    },
                    "expired-callback": () => {
                        callback.current(null);
                    },
                    "error-callback": () => {
                        callback.current(null);
                    }
                });
            })
            .catch(() => {
                callback.current(null);
            });
        return () => {
            cancelled = true;
            if (widgetId !== null) {
                window.turnstile?.remove(widgetId);
            }
        };
    }, [siteKey, action]);

    return <div ref={container} className="min-h-[65px]" />;
}
