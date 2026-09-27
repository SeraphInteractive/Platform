"use client";

import { maximumSpecialties, selfSelectableSpecialties, type Specialty } from "@platform/contracts";
import type { ReactNode } from "react";
import { Checkbox } from "@/Components/Ui/checkbox";
import { specialtyLabel } from "@/Lib/Format";

interface SpecialtyPickerProps {
    readonly selected: readonly Specialty[];
    readonly limit?: number;
    readonly disabled?: boolean;
    readonly onChange: (selected: Specialty[]) => void;
}

export function SpecialtyPicker({ selected, limit = maximumSpecialties, disabled, onChange }: SpecialtyPickerProps): ReactNode {
    return (
        <div className="grid gap-1 sm:grid-cols-2">
            {selfSelectableSpecialties.map((specialty) => {
                const checked = selected.includes(specialty);
                return (
                    <label key={specialty} className="hover:bg-accent flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm">
                        <Checkbox
                            checked={checked}
                            disabled={disabled === true || (!checked && selected.length >= limit)}
                            onCheckedChange={(value) => {
                                onChange(value === true ? [...selected, specialty] : selected.filter((item) => item !== specialty));
                            }}
                        />
                        {specialtyLabel(specialty)}
                    </label>
                );
            })}
        </div>
    );
}

export function splitSpecialties(specialties: readonly Specialty[]): { assigned: Specialty[]; chosen: Specialty[] } {
    return {
        assigned: specialties.filter((specialty) => !selfSelectableSpecialties.includes(specialty)),
        chosen: specialties.filter((specialty) => selfSelectableSpecialties.includes(specialty))
    };
}
