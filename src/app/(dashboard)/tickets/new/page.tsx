import { CreateTicketForm } from "@/components/modules/tickets/create-ticket-form"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

export default function NewTicketPage() {
    return (
        <div className="space-y-6">
            <div className="flex items-center space-x-4">
                <Link href="/tickets">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <h2 className="text-3xl font-bold tracking-tight">New Ticket</h2>
            </div>
            <CreateTicketForm />
        </div>
    )
}
