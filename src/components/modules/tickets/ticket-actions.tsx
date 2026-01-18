"use client"

import { updateTicketStatus } from "@/app/actions/ticket"
import { Button } from "@/components/ui/button"
import { useTransition } from "react"

interface TicketActionsProps {
    ticketId: string
    currentStatus: string
    userRole: string // "ADMIN", "TEACHER", "DEPARTMENT_HEAD"
}

export function TicketActions({ ticketId, currentStatus, userRole }: TicketActionsProps) {
    const [isPending, startTransition] = useTransition()

    const handleStatusChange = (status: string) => {
        startTransition(async () => {
            await updateTicketStatus(ticketId, status)
        })
    }

    // Teacher Actions (View Only for now, maybe confirm resolution later)
    if (userRole === "TEACHER") {
        if (currentStatus === "APPROVED") {
            return (
                <div className="p-2 bg-green-100 text-green-800 rounded-md text-sm font-medium">
                    Approved
                </div>
            )
        }
        return null
    }

    // Department Head Actions
    if (userRole === "DEPARTMENT_HEAD") {
        if (currentStatus === "OPEN") {
            return (
                <div className="flex gap-2">
                    <Button
                        onClick={() => handleStatusChange("APPROVED")}
                        disabled={isPending}
                        className="bg-green-600 hover:bg-green-700"
                        size="sm"
                    >
                        Approve
                    </Button>
                    <Button
                        onClick={() => handleStatusChange("FORWARDED_TO_ADMIN")}
                        disabled={isPending}
                        variant="secondary"
                        size="sm"
                    >
                        Forward to Admin
                    </Button>
                </div>
            )
        }
        return null
    }

    // Admin Actions
    if (userRole === "ADMIN") {
        if (currentStatus === "FORWARDED_TO_ADMIN" || currentStatus === "APPROVED") {
            return (
                <div className="flex gap-2">
                    <Button
                        onClick={() => handleStatusChange("CLOSED")}
                        disabled={isPending}
                        variant="destructive"
                        size="sm"
                    >
                        Close Ticket
                    </Button>
                </div>
            )
        }
        // Admin fallback for stuck tickets
        if (currentStatus !== "CLOSED") {
            return (
                <Button
                    onClick={() => handleStatusChange("CLOSED")}
                    disabled={isPending}
                    variant="outline"
                    size="sm"
                >
                    Force Close
                </Button>
            )
        }
    }

    return null
}
