"use client"

import { useState } from "react"
import { ROLES } from "@/lib/constants"
import { updateAssignmentRule } from "@/app/actions/workflow"
import { Checkbox } from "@/components/ui/checkbox"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

type AssignmentRuleSubset = {
    sourceRole: string
    targetRole: string
}

interface AssignmentMatrixProps {
    initialRules: AssignmentRuleSubset[]
}

export function AssignmentMatrix({ initialRules }: AssignmentMatrixProps) {
    const [rules, setRules] = useState<AssignmentRuleSubset[]>(initialRules)

    const handleToggle = async (source: string, target: string, checked: boolean) => {
        // Optimistic update
        const previousRules = [...rules]
        const newRules = checked
            ? [...rules, { sourceRole: source, targetRole: target }]
            : rules.filter(r => !(r.sourceRole === source && r.targetRole === target))

        setRules(newRules)

        try {
            await updateAssignmentRule(source, target, checked)
        } catch (error) {
            console.error("Failed to update rule", error)
            setRules(previousRules)
        }
    }

    const roles = Object.values(ROLES)

    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Quelle \ Ziel</TableHead>
                        {roles.map(role => (
                            <TableHead key={role}>{role}</TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {roles.map(sourceRole => (
                        <TableRow key={sourceRole}>
                            <TableCell className="font-medium">{sourceRole}</TableCell>
                            {roles.map(targetRole => {
                                const isEnabled = rules.some(r => r.sourceRole === sourceRole && r.targetRole === targetRole)
                                return (
                                    <TableCell key={`${sourceRole}-${targetRole}`}>
                                        <Checkbox
                                            className="border-gray-500"
                                            checked={isEnabled}
                                            onCheckedChange={(checked) => handleToggle(sourceRole, targetRole, checked as boolean)}
                                        />
                                    </TableCell>
                                )
                            })}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    )
}
