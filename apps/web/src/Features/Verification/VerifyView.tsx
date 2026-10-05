"use client";

import { emailCodeLength, type UserDto } from "@platform/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck } from "lucide-react";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { describeError } from "@/Api/ApiClient";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { PageHeader } from "@/Components/Common/PageHeader";
import { LoadingRows, SignInPrompt } from "@/Components/Common/States";
import { useSiteConfig } from "@/Components/SiteConfig";
import { Button } from "@/Components/Ui/button";
import { Input } from "@/Components/Ui/input";
import { Label } from "@/Components/Ui/label";
import { useNow } from "@/Hooks/UseNow";
import { useSession } from "@/Hooks/UseSession";
import { Turnstile } from "./Turnstile";

const captchaAction = "verify-email";
const developmentToken = "development";

interface Sent {
    readonly email: string;
    readonly resendAvailableAt: number;
}

function EmailStep({ onSent }: { readonly onSent: (sent: Sent) => void }): ReactNode {
    const id = useId();
    const { turnstileSiteKey } = useSiteConfig();
    const [email, setEmail] = useState("");
    const [token, setToken] = useState<string | null>(turnstileSiteKey === null ? developmentToken : null);
    const [widget, setWidget] = useState(0);

    const send = useMutation({
        mutationFn: () => platformApi.startEmailVerification(email.trim(), token ?? ""),
        onSuccess: (started) => {
            onSent({ email: email.trim(), resendAvailableAt: new Date(started.resendAvailableAt).getTime() });
        },
        onError: (error) => {
            toast.error(describeError(error));
            if (turnstileSiteKey !== null) {
                setToken(null);
                setWidget((current) => current + 1);
            }
        }
    });

    return (
        <form
            className="space-y-4"
            onSubmit={(event) => {
                event.preventDefault();
                if (token !== null && !send.isPending) {
                    send.mutate();
                }
            }}
        >
            <div className="space-y-2">
                <Label htmlFor={id}>Email</Label>
                <Input
                    id={id}
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                    value={email}
                    onChange={(event) => {
                        setEmail(event.target.value);
                    }}
                />
                <p className="text-muted-foreground text-xs">We send a code to this address. We don&apos;t keep the address itself.</p>
            </div>
            {turnstileSiteKey !== null && <Turnstile key={widget} siteKey={turnstileSiteKey} action={captchaAction} onToken={setToken} />}
            <Button type="submit" disabled={token === null || email.trim().length === 0 || send.isPending}>
                {send.isPending ? "Sending…" : "Send code"}
            </Button>
        </form>
    );
}

function CodeStep({ sent, onBack }: { readonly sent: Sent; readonly onBack: () => void }): ReactNode {
    const id = useId();
    const now = useNow();
    const queryClient = useQueryClient();
    const [code, setCode] = useState("");
    const confirm = useMutation({
        mutationFn: () => platformApi.confirmEmailVerification(code),
        onSuccess: (user) => {
            queryClient.setQueryData(queryKeys.me, user);
            toast.success("You're verified. You can vote now.");
        },
        onError: (error) => {
            setCode("");
            toast.error(describeError(error));
        }
    });
    const waitSeconds = Math.max(0, Math.ceil((sent.resendAvailableAt - now) / 1000));

    return (
        <form
            className="space-y-4"
            onSubmit={(event) => {
                event.preventDefault();
                if (code.length === emailCodeLength && !confirm.isPending) {
                    confirm.mutate();
                }
            }}
        >
            <div className="space-y-2">
                <Label htmlFor={id}>Code sent to {sent.email}</Label>
                <Input
                    id={id}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    maxLength={emailCodeLength}
                    className="w-40 font-mono text-lg tracking-[0.4em]"
                    value={code}
                    onChange={(event) => {
                        setCode(event.target.value.replace(/\D/gu, "").slice(0, emailCodeLength));
                    }}
                />
                <p className="text-muted-foreground text-xs">It expires in 15 minutes. Check your spam folder if it hasn&apos;t arrived.</p>
            </div>
            <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={code.length !== emailCodeLength || confirm.isPending}>
                    {confirm.isPending ? "Checking…" : "Verify"}
                </Button>
                <Button type="button" variant="ghost" disabled={waitSeconds > 0} onClick={onBack}>
                    {waitSeconds > 0 ? `Send a new code in ${waitSeconds}s` : "Use a different email or resend"}
                </Button>
            </div>
        </form>
    );
}

function Verified({ user }: { readonly user: UserDto }): ReactNode {
    return (
        <div className="flex flex-col items-start gap-3">
            <p className="flex items-center gap-2 text-sm">
                <BadgeCheck className="text-success size-4" />
                {user.username} is verified.
            </p>
            <Button asChild size="sm">
                <Link href="/voting">Go vote</Link>
            </Button>
        </div>
    );
}

export function VerifyView(): ReactNode {
    const { user, isLoading } = useSession();
    const [sent, setSent] = useState<Sent | null>(null);

    if (isLoading) {
        return <LoadingRows rows={3} />;
    }
    if (user === null) {
        return <SignInPrompt message="Sign in to verify your account." />;
    }
    return (
        <div className="max-w-md">
            <PageHeader title="Verify your account" description="Verify an email address to vote and pitch entries." />
            {user.isVerified ? (
                <Verified user={user} />
            ) : sent === null ? (
                <EmailStep onSent={setSent} />
            ) : (
                <CodeStep
                    sent={sent}
                    onBack={() => {
                        setSent(null);
                    }}
                />
            )}
        </div>
    );
}
