import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        // Create Admin
        const admin = await prisma.user.upsert({
            where: { email: 'admin@school.net' },
            update: {},
            create: {
                email: 'admin@school.net',
                name: 'Principal Skinner',
                role: 'ADMIN',
                password: 'admin',
                department: 'Administration'
            },
        })

        // Create Teacher
        const teacher = await prisma.user.upsert({
            where: { email: 'teacher@school.net' },
            update: {},
            create: {
                email: 'teacher@school.net',
                name: 'Edna Krabappel',
                role: 'TEACHER',
                password: 'user',
                department: 'Math'
            },
        })

        // Create Department Head
        const head = await prisma.user.upsert({
            where: { email: 'head@school.net' },
            update: {},
            create: {
                email: 'head@school.net',
                name: 'Dewey Largo',
                role: 'DEPARTMENT_HEAD',
                password: 'head',
                department: 'Music'
            },
        })

        return NextResponse.json({ success: true, users: [admin, teacher, head] })
    } catch (error) {
        return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
    }
}
