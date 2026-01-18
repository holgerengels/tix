const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
    console.log('Seeding database...')

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
        console.log('Created Admin:', admin.email)

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
        console.log('Created Teacher:', teacher.email)

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
        console.log('Created Dept Head:', head.email)

        console.log('Seeding finished.')
    } catch (e) {
        console.error('Seeding error:', e)
        process.exit(1)
    }
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
