import NextAuth from "next-auth"
import { authConfig } from "./lib/auth.config"

const { auth } = NextAuth(authConfig)

export default auth((req) => {
    console.log("Middleware running for:", req.nextUrl.pathname)
    // authorized callback in authConfig should handle the rest logic, 
    // but let's confirm this wrapper runs.
})

export const config = {
    // https://nextjs.org/docs/app/building-your-application/routing/middleware#matcher
    matcher: ['/((?!api|_next/static|_next/image|.*\\.png$).*)'],
}
