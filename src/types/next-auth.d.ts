import "next-auth"

declare module "next-auth" {
    interface User {
        role?: string
        department?: string | null
    }

    interface Session {
        user: User
    }
}

declare module "@auth/core/jwt" {
    interface JWT {
        role?: string
    }
}
