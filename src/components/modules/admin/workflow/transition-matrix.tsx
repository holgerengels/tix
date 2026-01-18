"use client"

import { useState } from "react"
import { ROLES, TICKET_STATUSES } from "@/lib/constants"
import { updateTransitionRule } from "@/app/actions/workflow"
import { Checkbox } from "@/components/ui/checkbox"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

type TransitionRuleSubset = {
    role: string
    fromStatus: string
    toStatus: string
}

interface TransitionMatrixProps {
    initialRules: TransitionRuleSubset[]
}

export function TransitionMatrix({ initialRules }: TransitionMatrixProps) {
    const [rules, setRules] = useState<TransitionRuleSubset[]>(initialRules)
    const [selectedRole, setSelectedRole] = useState<string>(Object.values(ROLES)[0])

    const handleToggle = async (from: string, to: string, checked: boolean) => {
        // Optimistic update
        const previousRules = [...rules]
        const newRules = checked
            ? [...rules, { role: selectedRole, fromStatus: from, toStatus: to }]
            : rules.filter(r => !(r.role === selectedRole && r.fromStatus === from && r.toStatus === to))

        setRules(newRules)

        try {
            await updateTransitionRule(selectedRole, from, to, checked)
        } catch (error) {
            console.error("Failed to update rule", error)
            setRules(previousRules)
        }
    }

    const statuses = Object.values(TICKET_STATUSES)

    return (
        <div className="space-y-4">
            <div className="flex items-center space-x-2">
                <span className="text-sm font-medium">Rolle auswählen:</span>
                <Select value={selectedRole} onValueChange={setSelectedRole}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Eine Rolle auswählen" />
                    </SelectTrigger>
                    <SelectContent>
                        {Object.values(ROLES).map(role => (
                            <SelectItem key={role} value={role}>{role}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="rounded-md border overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Von \ Nach</TableHead>
                            {statuses.map(status => (
                                <TableHead key={status} className="text-xs whitespace-nowrap px-2">{status}</TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {statuses.map(fromStatus => (
                            <TableRow key={fromStatus}>
                                <TableCell className="font-medium text-xs whitespace-nowrap px-2">{fromStatus}</TableCell>
                                {statuses.map(toStatus => {
                                    const isEnabled = rules.some(r =>
                                        r.role === selectedRole &&
                                        r.fromStatus === fromStatus &&
                                        r.toStatus === toStatus
                                    )
                                    return (
                                        <TableCell key={`${fromStatus}-${toStatus}`} className="text-center">
                                            <Checkbox
                                                className="border-gray-500"
                                                checked={isEnabled}
                                                onCheckedChange={(checked) => handleToggle(fromStatus, toStatus, checked as boolean)}
                                            />
                                        </TableCell>
                                    )
                                })}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
