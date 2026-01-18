import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    const users = await prisma.user.findMany()
    console.log('--- USERS ---')
    if (users.length === 0) {
        console.log('No users found.')
    } else {
        users.forEach(u => {
            console.log(`ID: ${u.id}, Email: ${u.email}, Role: ${u.role}, Name: ${u.name}`)
        })
    }
}

main()
    .catch(e => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
