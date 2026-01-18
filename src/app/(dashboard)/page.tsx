import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import Link from "next/link"
import { prisma } from "@/lib/prisma"

export default async function DashboardPage() {
    // Fetch News (mock or empty)
    const news = await prisma.news.findFirst({
        orderBy: { createdAt: 'desc' },
        where: { published: true }
    })

    // Fetch Recent Tickets count or list
    const ticketCount = await prisma.ticket.count()

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
                <div className="flex items-center space-x-2">
                    <Link href="/tickets/new">
                        <Button>
                            <Plus className="mr-2 h-4 w-4" /> New Ticket
                        </Button>
                    </Link>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <div className="col-span-4">
                    <Card className="h-full">
                        <CardHeader>
                            <CardTitle>News of the Day</CardTitle>
                            <CardDescription>Latest announcements for staff.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {news ? (
                                <div className="space-y-2">
                                    <h3 className="tex-lg font-semibold">{news.title}</h3>
                                    <p className="text-muted-foreground whitespace-pre-wrap">{news.content}</p>
                                    <p className="text-xs text-muted-foreground mt-4">Posted on {news.createdAt.toLocaleDateString()}</p>
                                </div>
                            ) : (
                                <div className="flex h-[200px] items-center justify-center rounded-md border border-dashed">
                                    <p className="text-sm text-muted-foreground">No news for today.</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
                <div className="col-span-3 space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>My Tickets</CardTitle>
                            <CardDescription>Overview of your tickets.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{ticketCount}</div>
                            <p className="text-xs text-muted-foreground">Total tickets in system (demo)</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle>Quick Actions</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <Button variant="outline" className="w-full justify-start">Create IT Support Ticket</Button>
                            <Button variant="outline" className="w-full justify-start">Request Leave</Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
