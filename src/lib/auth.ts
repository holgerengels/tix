import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { z } from "zod"
import { PrismaClient } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { authConfig } from "./auth.config"

// Mock LDAP or Credentials for Dev
export const { handlers, signIn, signOut, auth } = NextAuth({
    ...authConfig,
    providers: [
        Credentials({
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" },
            },
            authorize: async (credentials) => {
                const parsedCredentials = z
                    .object({ email: z.string().email(), password: z.string().min(6) })
                    .safeParse(credentials)

                if (parsedCredentials.success) {
                    const { email, password } = parsedCredentials.data
                    const user = await prisma.user.findUnique({ where: { email } })

                    if (!user) return null

                    // In real prod, verify password hash here. 
                    // For dev mock, we just check if it matches simple logic or bypass if needed.
                    // Implement real bcrypt compare here later.
                    return user
                }
                return null
            },
        }),
    ],
})
