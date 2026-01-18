"use server"

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"

// --- Assignment Rules ---

export async function getAssignmentRules() {
    const session = await auth()
    if (session?.user?.role !== "ADMIN") {
        throw new Error("Unauthorized")
    }

    const rules = await prisma.assignmentRule.findMany()
    return rules
}

export async function updateAssignmentRule(sourceRole: string, targetRole: string, enabled: boolean) {
    const session = await auth()
    if (session?.user?.role !== "ADMIN") {
        throw new Error("Unauthorized")
    }

    if (enabled) {
        // Create if not exists
        await prisma.assignmentRule.upsert({
            where: {
                sourceRole_targetRole: {
                    sourceRole,
                    targetRole
                }
            },
            create: {
                sourceRole,
                targetRole
            },
            update: {}
        })
    } else {
        // Delete
        try {
            await prisma.assignmentRule.delete({
                where: {
                    sourceRole_targetRole: {
                        sourceRole,
                        targetRole
                    }
                }
            })
        } catch (e) {
            // Ignore if already deleted
        }
    }

    revalidatePath("/admin/workflow")
}

// --- Status Transition Rules ---

export async function getTransitionRules() {
    const session = await auth()
    if (session?.user?.role !== "ADMIN") {
        throw new Error("Unauthorized")
    }

    const rules = await prisma.statusTransitionRule.findMany()
    return rules
}

export async function updateTransitionRule(role: string, fromStatus: string, toStatus: string, enabled: boolean) {
    const session = await auth()
    if (session?.user?.role !== "ADMIN") {
        throw new Error("Unauthorized")
    }

    if (enabled) {
        await prisma.statusTransitionRule.upsert({
            where: {
                role_fromStatus_toStatus: {
                    role,
                    fromStatus,
                    toStatus
                }
            },
            create: {
                role,
                fromStatus,
                toStatus
            },
            update: {}
        })
    } else {
        try {
            await prisma.statusTransitionRule.delete({
                where: {
                    role_fromStatus_toStatus: {
                        role,
                        fromStatus,
                        toStatus
                    }
                }
            })
        } catch (e) {
            // Ignore
        }
    }

    revalidatePath("/admin/workflow")
}
