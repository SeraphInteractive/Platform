"use client";

import { maximumSpecialties, type Specialty, type UserDto } from "@platform/contracts";
import { BadgeCheck } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/Components/Common/PageHeader";
import { Section } from "@/Components/Common/Section";
import { LoadingRows, SignInPrompt } from "@/Components/Common/States";
import { Tone, ToneBadge } from "@/Components/Common/StatusBadge";
import { Avatar, AvatarFallback, AvatarImage } from "@/Components/Ui/avatar";
import { Button } from "@/Components/Ui/button";
import { useSession } from "@/Hooks/UseSession";
import { formatDate, specialtyLabel } from "@/Lib/Format";
import { roleLabels } from "@/Lib/Roles";
import { safeHttpUrl } from "@/Lib/SafeUrl";
import { SpecialtyPicker, splitSpecialties } from "./SpecialtyPicker";
import { useChooseSpecialties } from "./UseChooseSpecialties";

function Identity({ user }: { readonly user: UserDto }): ReactNode {
    const avatar = safeHttpUrl(user.avatarUrl);
    return (
        <div className="flex items-center gap-4">
            <Avatar className="size-14">
                {avatar !== null && <AvatarImage src={avatar} alt="" />}
                <AvatarFallback>{user.username.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 space-y-1">
                <p className="truncate text-lg font-semibold">{user.username}</p>
                <ToneBadge tone={Tone.Info}>{roleLabels[user.role]}</ToneBadge>
                <p className="text-muted-foreground text-xs">Member since {formatDate(user.createdAt)}</p>
            </div>
        </div>
    );
}

function Specialties({ user }: { readonly user: UserDto }): ReactNode {
    const { assigned, chosen } = splitSpecialties(user.specialties);
    const [selected, setSelected] = useState<Specialty[]>(chosen);
    const choose = useChooseSpecialties();
    const changed = selected.length !== chosen.length || selected.some((item) => !chosen.includes(item));
    const limit = maximumSpecialties - assigned.length;

    return (
        <Section title="Specialties">
            <div className="space-y-3">
                {assigned.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                        {assigned.map((specialty) => (
                            <ToneBadge key={specialty} tone={Tone.Neutral}>
                                {specialtyLabel(specialty)}
                            </ToneBadge>
                        ))}
                        <span className="text-muted-foreground text-xs">Assigned by staff</span>
                    </div>
                )}
                {limit > 0 ? (
                    <>
                        <p className="text-muted-foreground text-xs">Up to {limit}</p>
                        <SpecialtyPicker selected={selected} limit={limit} disabled={choose.isPending} onChange={setSelected} />
                        <Button
                            size="sm"
                            disabled={!changed || choose.isPending}
                            onClick={() => {
                                choose.mutate(selected, {
                                    onSuccess: () => {
                                        toast.success("Specialties saved.");
                                    }
                                });
                            }}
                        >
                            Save
                        </Button>
                    </>
                ) : (
                    <p className="text-muted-foreground text-sm">Ask staff to change your specialties.</p>
                )}
            </div>
        </Section>
    );
}

export function ProfileView(): ReactNode {
    const { user, isLoading } = useSession();
    if (isLoading) {
        return <LoadingRows rows={4} />;
    }
    if (user === null) {
        return <SignInPrompt message="Sign in to see your profile." />;
    }
    return (
        <>
            <PageHeader title="Profile" />
            <div className="space-y-10">
                <Identity user={user} />
                <Section title="Verification">
                    {user.isVerified ? (
                        <p className="flex items-center gap-2 text-sm">
                            <BadgeCheck className="text-success size-4" />
                            Email verified
                        </p>
                    ) : (
                        <div className="flex flex-col items-start gap-3">
                            <p className="text-sm">Verify your email to vote and pitch entries.</p>
                            <Button asChild size="sm">
                                <Link href="/verify">Verify</Link>
                            </Button>
                        </div>
                    )}
                </Section>
                <Specialties key={user.specialties.join(",")} user={user} />
            </div>
        </>
    );
}
