"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator
} from "@/Components/Ui/breadcrumb";
import { segmentLabels } from "./Navigation";

interface BreadcrumbLabels {
    readonly labels: ReadonlyMap<string, string>;
    readonly setLabel: (segment: string, label: string | null) => void;
}

const BreadcrumbContext = createContext<BreadcrumbLabels>({ labels: new Map(), setLabel: () => undefined });

export function BreadcrumbProvider({ children }: { readonly children: ReactNode }): ReactNode {
    const [labels, setLabels] = useState<ReadonlyMap<string, string>>(new Map());
    const setLabel = useCallback((segment: string, label: string | null): void => {
        setLabels((current) => {
            if ((current.get(segment) ?? null) === label) {
                return current;
            }
            const next = new Map(current);
            if (label === null) {
                next.delete(segment);
            } else {
                next.set(segment, label);
            }
            return next;
        });
    }, []);
    const value = useMemo(() => ({ labels, setLabel }), [labels, setLabel]);
    return <BreadcrumbContext value={value}>{children}</BreadcrumbContext>;
}

export function useBreadcrumbLabel(segment: string, label: string | undefined): void {
    const { setLabel } = useContext(BreadcrumbContext);
    useEffect(() => {
        if (label === undefined) {
            return;
        }
        setLabel(segment, label);
        return () => {
            setLabel(segment, null);
        };
    }, [segment, label, setLabel]);
}

export function Breadcrumbs(): ReactNode {
    const pathname = usePathname();
    const { labels } = useContext(BreadcrumbContext);
    const segments = pathname.split("/").filter((segment) => segment.length > 0);
    if (segments.length === 0) {
        return <span className="text-sm font-medium">Overview</span>;
    }
    return (
        <Breadcrumb className="min-w-0">
            <BreadcrumbList className="flex-nowrap">
                {segments.map((segment, index) => {
                    const href = `/${segments.slice(0, index + 1).join("/")}`;
                    const label = labels.get(segment) ?? segmentLabels[segment] ?? "…";
                    const isLast = index === segments.length - 1;
                    return (
                        <Fragment key={href}>
                            {index > 0 && <BreadcrumbSeparator />}
                            <BreadcrumbItem className={isLast ? "min-w-0" : "hidden sm:inline-flex"}>
                                {isLast ? (
                                    <BreadcrumbPage className="truncate">{label}</BreadcrumbPage>
                                ) : (
                                    <BreadcrumbLink asChild>
                                        <Link href={href as Route}>{label}</Link>
                                    </BreadcrumbLink>
                                )}
                            </BreadcrumbItem>
                        </Fragment>
                    );
                })}
            </BreadcrumbList>
        </Breadcrumb>
    );
}
