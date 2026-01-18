import { getTicket } from "@/app/actions/ticket"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TicketActions } from "@/components/modules/tickets/ticket-actions"
import { Separator } from "@/components/ui/separator"

export default async function TicketDetailPage({ params }: { params: { ticketId: string } }) {
    const session = await auth()
    if (!session?.user?.email) return <div>Please login</div>

    const ticket = await getTicket(params.ticketId)
    if (!ticket) notFound()

    // Fetch user role correctly from DB for permission check
    const currentUser = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!currentUser) return <div>User error</div>

    return (
        <div className="space-y-6">
            <div className="flex items-center space-x-4">
                <Link href="/tickets">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div className="flex-1">
                    <h2 className="text-3xl font-bold tracking-tight">{ticket.title}</h2>
                    <div className="text-muted-foreground flex gap-2 items-center mt-1">
                        <span>{ticket.type}</span>
                        <span>•</span>
                        <span>Created by {ticket.author.name}</span>
                        <span>•</span>
                        <span>{ticket.createdAt.toLocaleDateString()}</span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Badge className="text-lg px-4 py-1" variant="outline">{ticket.status}</Badge>
                    <TicketActions
                        ticketId={ticket.id}
                        currentStatus={ticket.status}
                        userRole={currentUser.role}
                    />
                </div>
            </div>

            <div className="grid grid-cols-3 gap-6">
                <div className="col-span-2 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Description</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="whitespace-pre-wrap leading-relaxed">{ticket.description}</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Workflow History</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {ticket.approvals.length === 0 ? (
                                <p className="text-muted-foreground text-sm italic">No approvals yet.</p>
                            ) : (
                                <ul className="space-y-4">
                                    {ticket.approvals.map(approval => (
                                        <li key={approval.id} className="flex items-start gap-3">
                                            <div className="rounded-full bg-slate-100 p-2">
                                                <div className={`w-2 h-2 rounded-full ${approval.status === 'APPROVED' ? 'bg-green-500' : 'bg-red-500'}`} />
                                            </div>
                                            <div>
                                                <p className="font-medium">{approval.status} by {approval.approver.name}</p>
                                                <p className="text-xs text-muted-foreground">{approval.createdAt.toLocaleString()}</p>
                                                {approval.comment && <p className="text-sm mt-1">{approval.comment}</p>}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </CardContent>
                    </Card>
                </div>
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Details</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <span className="text-sm font-medium text-muted-foreground">Priority</span>
                                <div className="mt-1 font-medium">{ticket.priority}</div>
                            </div>
                            <Separator />
                            <div>
                                <span className="text-sm font-medium text-muted-foreground">Assignee</span>
                                <div className="mt-1 font-medium">{ticket.assignee?.name || 'Unassigned'}</div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
