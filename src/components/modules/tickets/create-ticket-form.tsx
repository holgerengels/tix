"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { createTicket } from "@/app/actions/ticket"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

const initialState = {
    message: "",
    errors: undefined,
}

function SubmitButton() {
    const { pending } = useFormStatus()
    return (
        <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Creating..." : "Create Ticket"}
        </Button>
    )
}

export function CreateTicketForm() {
    // Note: React 19 useActionState is experimental in some Next versions, 
    // but Next 15 Stable supports it (renamed from useFormState).
    // If specific version issues arise, fallback to useFormState or standard handler.
    const [state, formAction] = useActionState(createTicket, initialState)

    return (
        <Card className="max-w-2xl mx-auto">
            <CardHeader>
                <CardTitle>Create New Ticket</CardTitle>
                <CardDescription>Submit a new request to the internal system.</CardDescription>
            </CardHeader>
            <form action={formAction}>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="title">Subject</Label>
                        <Input id="title" name="title" placeholder="e.g. Projector not working" required />
                        {state?.errors?.title && <p className="text-red-500 text-sm">{state.errors.title}</p>}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="type">Type</Label>
                            <Select name="type" defaultValue="IT Support">
                                <SelectTrigger>
                                    <SelectValue placeholder="Select type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="IT Support">IT Support</SelectItem>
                                    <SelectItem value="Facility">Facility (Hausmeister)</SelectItem>
                                    <SelectItem value="Leave Request">Leave Request</SelectItem>
                                    <SelectItem value="Event">Event Planning</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="priority">Priority</Label>
                            <Select name="priority" defaultValue="MEDIUM">
                                <SelectTrigger>
                                    <SelectValue placeholder="Select priority" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="LOW">Low</SelectItem>
                                    <SelectItem value="MEDIUM">Medium</SelectItem>
                                    <SelectItem value="HIGH">High</SelectItem>
                                    <SelectItem value="URGENT">Urgent</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <Textarea id="description" name="description" placeholder="Describe the issue in detail..." className="min-h-[120px]" required />
                        {state?.errors?.description && <p className="text-red-500 text-sm">{state.errors.description}</p>}
                    </div>
                    {state?.message && <p className="text-red-500 text-sm">{state.message}</p>}
                </CardContent>
                <CardFooter>
                    <SubmitButton />
                </CardFooter>
            </form>
        </Card>
    )
}
