"use client";

import {
    ageOfMajorityFor,
    ageOn,
    claCountries,
    ClaStatus,
    countryName,
    DocumentSlug,
    fieldRules,
    GuardianRelationship,
    guardianRelationshipLabels,
    minimumClaAge,
    regionsOf,
    textLimits,
    type ClaAgreementDto,
    type ClaSignInputDto,
    type DocumentDto,
    type MyClaDto
} from "@platform/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Clock } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ApiError, describeError } from "@/Api/ApiClient";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { ConfirmButton } from "@/Components/Common/ConfirmButton";
import { TextInputField } from "@/Components/Common/FormField";
import { PageHeader } from "@/Components/Common/PageHeader";
import { EmptyState, ErrorState, LoadingRows, SignInPrompt } from "@/Components/Common/States";
import { Alert, AlertDescription, AlertTitle } from "@/Components/Ui/alert";
import { Button } from "@/Components/Ui/button";
import { Checkbox } from "@/Components/Ui/checkbox";
import { Input } from "@/Components/Ui/input";
import { Label } from "@/Components/Ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/Components/Ui/select";
import { DocumentSections } from "@/Features/Documents/DocumentView";
import { useSession } from "@/Hooks/UseSession";
import { formatDate, formatDateTime } from "@/Lib/Format";
import { downloadReceipt } from "./ClaReceiptDownload";

const countryOptions = claCountries
    .map((code) => ({ code, name: countryName(code) }))
    .sort((left, right) => left.name.localeCompare(right.name));

const closedMessages: Partial<Record<ClaStatus, string>> = {
    [ClaStatus.GuardianRejected]: "Your guardian declined. You can sign again and name a different guardian.",
    [ClaStatus.GuardianExpired]: "Your guardian didn't respond in time. Sign again to send a new request.",
    [ClaStatus.Revoked]: "Your agreement was revoked. Sign again to keep contributing."
};

function SelectField({
    id,
    label,
    value,
    placeholder,
    options,
    onValueChange
}: {
    readonly id: string;
    readonly label: string;
    readonly value: string;
    readonly placeholder: string;
    readonly options: readonly { readonly value: string; readonly label: string }[];
    readonly onValueChange: (value: string) => void;
}): ReactNode {
    return (
        <div className="space-y-1.5">
            <Label htmlFor={id}>{label}</Label>
            <Select value={value} onValueChange={onValueChange}>
                <SelectTrigger id={id} className="w-full">
                    <SelectValue placeholder={placeholder} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                    {options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                            {option.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}

interface GuardianDraft {
    readonly legalName: string;
    readonly relationship: GuardianRelationship | "";
    readonly email: string;
    readonly phone: string;
}

function GuardianFields({
    draft,
    onChange
}: {
    readonly draft: GuardianDraft;
    readonly onChange: (draft: GuardianDraft) => void;
}): ReactNode {
    const id = useId();
    return (
        <fieldset className="space-y-4 border p-4">
            <legend className="px-1 text-sm font-medium">Parent or guardian</legend>
            <p className="text-muted-foreground text-sm">
                You&apos;re under the age of majority where you live. We&apos;ll email your parent or guardian to review and consent. Your
                agreement takes effect once they do.
            </p>
            <TextInputField
                id={`${id}-name`}
                label="Their full legal name"
                value={draft.legalName}
                rule={fieldRules.legalName}
                limit={textLimits.legalName}
                autoComplete="off"
                onValueChange={(legalName) => {
                    onChange({ ...draft, legalName });
                }}
            />
            <SelectField
                id={`${id}-relationship`}
                label="Relationship to you"
                value={draft.relationship}
                placeholder="Choose"
                options={Object.values(GuardianRelationship).map((value) => ({ value, label: guardianRelationshipLabels[value] }))}
                onValueChange={(relationship) => {
                    onChange({ ...draft, relationship: relationship as GuardianRelationship });
                }}
            />
            <div className="space-y-1.5">
                <Label htmlFor={`${id}-email`}>Their email</Label>
                <Input
                    id={`${id}-email`}
                    type="email"
                    autoComplete="off"
                    maxLength={textLimits.email}
                    value={draft.email}
                    onChange={(event) => {
                        onChange({ ...draft, email: event.target.value });
                    }}
                />
            </div>
            <div className="space-y-1.5">
                <Label htmlFor={`${id}-phone`}>Their phone (optional)</Label>
                <Input
                    id={`${id}-phone`}
                    type="tel"
                    autoComplete="off"
                    maxLength={textLimits.phone}
                    value={draft.phone}
                    onChange={(event) => {
                        onChange({ ...draft, phone: event.target.value });
                    }}
                />
            </div>
        </fieldset>
    );
}

function SignForm({ document, onSigned }: { readonly document: DocumentDto; readonly onSigned: () => void }): ReactNode {
    const id = useId();
    const queryClient = useQueryClient();
    const [legalName, setLegalName] = useState("");
    const [email, setEmail] = useState("");
    const [dateOfBirth, setDateOfBirth] = useState("");
    const [country, setCountry] = useState("");
    const [region, setRegion] = useState("");
    const [accepted, setAccepted] = useState(false);
    const [guardian, setGuardian] = useState<GuardianDraft>({ legalName: "", relationship: "", email: "", phone: "" });

    const regions = country === "" ? null : regionsOf(country);
    const ageOfMajority = country === "" ? null : ageOfMajorityFor(country, regions === null ? null : region === "" ? null : region);
    const age = dateOfBirth === "" ? null : ageOn(dateOfBirth, new Date());
    const isMinor = age !== null && ageOfMajority !== null && age < ageOfMajority;
    const isTooYoung = age !== null && age < minimumClaAge;
    const guardianComplete = guardian.legalName.trim() !== "" && guardian.relationship !== "" && guardian.email.trim() !== "";
    const isComplete =
        legalName.trim() !== "" &&
        email.trim() !== "" &&
        age !== null &&
        !isTooYoung &&
        ageOfMajority !== null &&
        accepted &&
        (!isMinor || guardianComplete);

    const sign = useMutation({
        mutationFn: () => {
            const input: ClaSignInputDto = {
                revision: document.revision,
                legalName,
                email: email.trim(),
                dateOfBirth,
                country: country as ClaSignInputDto["country"],
                region: regions === null ? null : region,
                accepted: true,
                guardian:
                    isMinor && guardian.relationship !== ""
                        ? {
                              legalName: guardian.legalName,
                              relationship: guardian.relationship,
                              email: guardian.email.trim(),
                              phone: guardian.phone.trim() === "" ? null : guardian.phone
                          }
                        : null
            };
            return platformApi.signCla(input);
        },
        onSuccess: (agreement) => {
            queryClient.setQueryData<MyClaDto>(queryKeys.myCla, (current) =>
                current === undefined ? current : { ...current, current: agreement }
            );
            void queryClient.invalidateQueries({ queryKey: queryKeys.myCla });
            toast.success(
                agreement.status === ClaStatus.Active ? "Signed. A copy is on its way to your inbox." : "Signed. We emailed your guardian."
            );
            onSigned();
        },
        onError: (error) => {
            if (error instanceof ApiError && error.status === 409) {
                void queryClient.invalidateQueries({ queryKey: queryKeys.document(DocumentSlug.Cla) });
                void queryClient.invalidateQueries({ queryKey: queryKeys.myCla });
            }
            toast.error(describeError(error));
        }
    });

    return (
        <div className="space-y-8">
            <div className="max-h-[28rem] overflow-y-auto border p-4">
                <DocumentSections document={document} />
            </div>
            <form
                className="max-w-md space-y-4"
                onSubmit={(event) => {
                    event.preventDefault();
                    if (isComplete && !sign.isPending) {
                        sign.mutate();
                    }
                }}
            >
                <TextInputField
                    id={`${id}-name`}
                    label="Full legal name"
                    hint="Typing your name here is your signature."
                    value={legalName}
                    rule={fieldRules.legalName}
                    limit={textLimits.legalName}
                    autoComplete="name"
                    onValueChange={setLegalName}
                />
                <div className="space-y-1.5">
                    <Label htmlFor={`${id}-email`}>Email</Label>
                    <Input
                        id={`${id}-email`}
                        type="email"
                        autoComplete="email"
                        maxLength={textLimits.email}
                        value={email}
                        onChange={(event) => {
                            setEmail(event.target.value);
                        }}
                    />
                    <p className="text-muted-foreground text-xs">We send your copy of the agreement here.</p>
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor={`${id}-dob`}>Date of birth</Label>
                    <Input
                        id={`${id}-dob`}
                        type="date"
                        autoComplete="bday"
                        className="w-48"
                        value={dateOfBirth}
                        onChange={(event) => {
                            setDateOfBirth(event.target.value);
                        }}
                    />
                    {isTooYoung && <p className="text-destructive text-xs">You must be at least {minimumClaAge} to sign.</p>}
                </div>
                <SelectField
                    id={`${id}-country`}
                    label="Country of residence"
                    value={country}
                    placeholder="Choose a country"
                    options={countryOptions.map((option) => ({ value: option.code, label: option.name }))}
                    onValueChange={(value) => {
                        setCountry(value);
                        setRegion("");
                    }}
                />
                {regions !== null && (
                    <SelectField
                        id={`${id}-region`}
                        label="State, province or territory"
                        value={region}
                        placeholder="Choose"
                        options={regions.map((option) => ({ value: option.code, label: option.name }))}
                        onValueChange={setRegion}
                    />
                )}
                {isMinor && !isTooYoung && <GuardianFields draft={guardian} onChange={setGuardian} />}
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <Checkbox
                        className="mt-0.5"
                        checked={accepted}
                        onCheckedChange={(value) => {
                            setAccepted(value === true);
                        }}
                    />
                    I have read and agree to the {document.title} (revision {document.revision}), and I am signing it electronically.
                </label>
                <Button type="submit" disabled={!isComplete || sign.isPending}>
                    {sign.isPending ? "Signing…" : "Sign agreement"}
                </Button>
            </form>
        </div>
    );
}

function Pending({
    agreement,
    onChangeGuardian
}: {
    readonly agreement: ClaAgreementDto;
    readonly onChangeGuardian: () => void;
}): ReactNode {
    const queryClient = useQueryClient();
    const resend = useMutation({
        mutationFn: () => platformApi.resendGuardianRequest(),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.myCla });
            toast.success("We sent your guardian a new link.");
        },
        onError: (error) => {
            toast.error(describeError(error));
        }
    });
    return (
        <div className="max-w-md space-y-4">
            <p className="flex items-center gap-2 text-sm">
                <Clock className="text-warning size-4" />
                Waiting for your guardian to consent.
            </p>
            <p className="text-muted-foreground text-sm">
                We emailed them a link on {formatDate(agreement.guardian?.requestedAt ?? agreement.signedAt)}. It expires{" "}
                {formatDateTime(agreement.guardian?.expiresAt ?? null)}.
            </p>
            <div className="flex flex-wrap gap-2">
                <Button
                    size="sm"
                    variant="outline"
                    disabled={resend.isPending}
                    onClick={() => {
                        resend.mutate();
                    }}
                >
                    {resend.isPending ? "Sending…" : "Resend email"}
                </Button>
                <Button size="sm" variant="ghost" onClick={onChangeGuardian}>
                    Change guardian
                </Button>
            </div>
        </div>
    );
}

function Signed({ agreement }: { readonly agreement: ClaAgreementDto }): ReactNode {
    const queryClient = useQueryClient();
    const receipt = useMutation({
        mutationFn: () => platformApi.claReceipt(),
        onSuccess: downloadReceipt,
        onError: (error) => {
            toast.error(describeError(error));
        }
    });
    const revoke = useMutation({
        mutationFn: () => platformApi.revokeCla(null),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.myCla });
            toast.success("Your agreement was revoked.");
        },
        onError: (error) => {
            toast.error(describeError(error));
        }
    });
    return (
        <div className="max-w-md space-y-4">
            <p className="flex items-center gap-2 text-sm">
                <BadgeCheck className="text-success size-4" />
                Signed {formatDate(agreement.signedAt)}
                {agreement.guardian?.decidedAt !== null &&
                    agreement.guardian !== null &&
                    `, guardian consented ${formatDate(agreement.guardian.decidedAt)}`}
                .
            </p>
            <div className="flex flex-wrap gap-2">
                <Button
                    size="sm"
                    disabled={receipt.isPending}
                    onClick={() => {
                        receipt.mutate();
                    }}
                >
                    {receipt.isPending ? "Preparing…" : "Download your copy"}
                </Button>
                <ConfirmButton
                    title="Revoke your agreement?"
                    description="You won't be able to claim or submit work until you sign again. Work you already submitted stays covered by this agreement."
                    confirmLabel="Revoke"
                    destructive
                    variant="ghost"
                    disabled={revoke.isPending}
                    onConfirm={() => {
                        revoke.mutate();
                    }}
                >
                    Revoke
                </ConfirmButton>
            </div>
        </div>
    );
}

function Agreement({ overview }: { readonly overview: MyClaDto }): ReactNode {
    const [isChangingGuardian, setChangingGuardian] = useState(false);
    const document = useQuery({ queryKey: queryKeys.document(DocumentSlug.Cla), queryFn: () => platformApi.document(DocumentSlug.Cla) });
    const current = overview.current;

    if (current?.status === ClaStatus.Active) {
        return <Signed agreement={current} />;
    }
    if (current?.status === ClaStatus.PendingGuardian && !isChangingGuardian) {
        return (
            <Pending
                agreement={current}
                onChangeGuardian={() => {
                    setChangingGuardian(true);
                }}
            />
        );
    }
    if (overview.document.revision === 0) {
        return <EmptyState title="Not published yet">The agreement will be available to sign soon.</EmptyState>;
    }
    if (document.isPending) {
        return <LoadingRows rows={4} />;
    }
    if (document.error !== null) {
        return <ErrorState error={document.error} onRetry={document.refetch} />;
    }
    const closedMessage = current === null ? undefined : closedMessages[current.status];
    return (
        <div className="space-y-6">
            {closedMessage !== undefined && (
                <Alert>
                    <AlertTitle>Not in effect</AlertTitle>
                    <AlertDescription>{closedMessage}</AlertDescription>
                </Alert>
            )}
            {isChangingGuardian && <p className="text-muted-foreground text-sm">Signing again cancels the request you sent earlier.</p>}
            <SignForm
                document={document.data}
                onSigned={() => {
                    setChangingGuardian(false);
                }}
            />
        </div>
    );
}

export function ClaView(): ReactNode {
    const { user, isLoading } = useSession();
    const overview = useQuery({ queryKey: queryKeys.myCla, queryFn: () => platformApi.myCla(), enabled: user !== null });

    if (isLoading) {
        return <LoadingRows rows={3} />;
    }
    if (user === null) {
        return <SignInPrompt message="Sign in to sign the contributor license agreement." />;
    }
    return (
        <div className="max-w-3xl">
            <PageHeader title="Contributor License Agreement" description="Sign once to claim tasks and submit work." />
            {overview.isPending ? (
                <LoadingRows rows={3} />
            ) : overview.error !== null ? (
                <ErrorState error={overview.error} onRetry={overview.refetch} />
            ) : (
                <Agreement overview={overview.data} />
            )}
        </div>
    );
}
