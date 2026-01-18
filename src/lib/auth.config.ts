import type { NextAuthConfig } from "next-auth"

export const authConfig = {
    pages: {
        signIn: '/login',
    },
    callbacks: {
        async jwt({ token, user }) {
            console.log("JWT Callback", { tokenSub: token.sub, userVal: user })
            if (user) {
                token.role = user.role
                token.sub = user.id // ensure sub is set to id
            }
            return token
        },
        async session({ session, token }) {
            console.log("Session Callback", { sessionUser: session.user, tokenSub: token.sub })
            if (session?.user && token.sub) {
                session.user.id = token.sub
                session.user.role = token.role as string | undefined
            }
            return session
        },
        authorized({ auth, request: { nextUrl } }) {
            const isLoggedIn = !!auth?.user
            console.log("Authorized Callback", {
                path: nextUrl.pathname,
                isLoggedIn,
                user: auth?.user
            })

            const isOnDashboard = nextUrl.pathname !== '/login' // Protect everything except login
            const isOnAdmin = nextUrl.pathname.startsWith('/admin')

            // Allow public api/seed for dev
            if (nextUrl.pathname.startsWith('/api/seed')) return true;

            if (isOnAdmin) {
                if (isLoggedIn && auth?.user?.role === 'ADMIN') return true
                return false // Redirect if not admin
            }

            // Redirect unauthenticated users to login page
            if (isOnDashboard) {
                if (isLoggedIn) return true
                return false // Redirects to login
            } else if (isLoggedIn) {
                // Redirect logged in users to dashboard if they visit login
                return Response.redirect(new URL('/', nextUrl))
            }
            return true
        },
    },
    providers: [], // Configured in auth.ts
} satisfies NextAuthConfig
