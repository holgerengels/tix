import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    // Create Admin
    const admin = await prisma.user.upsert({
        where: { email: 'admin@school.net' },
        update: {},
        create: {
            email: 'admin@school.net',
            name: 'Principal Skinner',
            role: 'ADMIN', // Using string directly since enum might be hard to import in JS without type
            password: 'admin', // In real app, hash this!
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
            password: 'user', // In real app, hash this!
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

    console.log({ admin, teacher, head })
}

main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        process.exit(1)
    })
