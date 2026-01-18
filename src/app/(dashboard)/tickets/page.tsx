import { getTickets } from "@/app/actions/ticket"
import { auth } from "@/lib/auth"
import { TicketActions } from "@/components/modules/tickets/ticket-actions"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import Link from "next/link"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

export default async function TicketsPage() {
    const session = await auth()
    const tickets = await getTickets()

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold tracking-tight">Tickets</h2>
                <Link href="/tickets/new">
                    <Button>
                        <Plus className="mr-2 h-4 w-4" /> Create Ticket
                    </Button>
                </Link>
            </div>

            <div className="rounded-md border bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Subject</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Priority</TableHead>
                            <TableHead>Author</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {tickets.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="h-24 text-center">
                                    No tickets found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            tickets.map((ticket) => (
                                <TableRow key={ticket.id}>
                                    <TableCell className="font-medium">{ticket.title}</TableCell>
                                    <TableCell>{ticket.type}</TableCell>
                                    <TableCell>
                                        <Badge variant={ticket.status === 'OPEN' ? 'default' : 'secondary'}>
                                            {ticket.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={ticket.priority === 'URGENT' || ticket.priority === 'HIGH' ? 'destructive' : 'outline'}>
                                            {ticket.priority}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>{ticket.author.name}</TableCell>
                                    <TableCell>{ticket.createdAt.toLocaleDateString()}</TableCell>
                                    <TableCell className="text-right">
                                        <TicketActions
                                            ticketId={ticket.id}
                                            currentStatus={ticket.status}
                                            userRole={session?.user?.role || ''}
                                        />
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
