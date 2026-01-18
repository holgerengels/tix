"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

const ticketSchema = z.object({
    title: z.string().min(3),
    description: z.string().min(10),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
    type: z.string(),
})

export async function createTicket(prevState: any, formData: FormData) {
    const session = await auth()
    if (!session?.user?.email) {
        return { message: "Unauthorized" }
    }

    const user = await prisma.user.findUnique({
        where: { email: session.user.email }
    })

    if (!user) return { message: "User not found" }

    const validatedFields = ticketSchema.safeParse({
        title: formData.get("title"),
        description: formData.get("description"),
        priority: formData.get("priority"),
        type: formData.get("type"),
    })

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: "Validation failed"
        }
    }

    const { title, description, priority, type } = validatedFields.data

    try {
        await prisma.ticket.create({
            data: {
                title,
                description,
                priority: priority as any,
                type,
                status: "OPEN",
                authorId: user.id,
            },
        })
    } catch (e) {
        return { message: "Database Error: Failed to create ticket." }
    }

    revalidatePath("/tickets")
    redirect("/tickets")
}

export async function getTickets() {
    const session = await auth()
    if (!session?.user?.email) return []

    // For now, return all tickets. Ideally filter by role/visible scope.
    return await prisma.ticket.findMany({
        orderBy: { createdAt: 'desc' },
        include: { author: true, assignee: true }
    })
}

export async function getTicket(id: string) {
    const session = await auth()
    if (!session?.user?.email) return null

    return await prisma.ticket.findUnique({
        where: { id },
        include: {
            author: true,
            assignee: true,
            approvals: { include: { approver: true } }
        }
    })
}

export async function updateTicketStatus(ticketId: string, status: string) {
    const session = await auth()
    if (!session?.user?.email) return { message: "Unauthorized" }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) return { message: "User not found" }

    // Role-based Access Control for Transitions
    // simple check for demo:
    // Dept Head -> can set APPROVED, FORWARDED_TO_ADMIN
    // Admin -> can set CLOSED

    // In a real app, strict state machine logic goes here.

    await prisma.ticket.update({
        where: { id: ticketId },
        data: { status: status as any }
    })

    // If approving, maybe auto-create an Approval record
    if (status === 'APPROVED' || status === 'REJECTED') {
        await prisma.approval.create({
            data: {
                ticketId,
                approverId: user.id,
                status: status as any
            }
        })
    }

    revalidatePath(`/tickets/${ticketId}`)
    revalidatePath("/tickets")
}
