"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
    LayoutDashboard,
    Ticket,
    Newspaper,
    Calendar,
    Settings,
    LogOut,
    Menu
} from "lucide-react"

import { logout } from "@/app/actions/auth"

import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

const routes = [
    {
        label: "Dashboard",
        icon: LayoutDashboard,
        href: "/",
        color: "text-sky-500",
    },
    {
        label: "Tickets",
        icon: Ticket,
        href: "/tickets",
        color: "text-violet-500",
    },
    {
        label: "News",
        icon: Newspaper,
        href: "/news",
        color: "text-pink-700",
    },
    {
        label: "Calendar",
        icon: Calendar,
        href: "/calendar",
        color: "text-orange-700",
    },
    {
        label: "Admin",
        icon: Settings,
        href: "/admin",
        color: "text-gray-500", // Should be protected in render
    },
]

interface SidebarProps {
    className?: string
    user?: {
        name?: string | null
        email?: string | null
        role?: string
        image?: string | null
    }
}

export function Sidebar({ className, user }: SidebarProps) {
    const pathname = usePathname()

    // Filter routes based on role
    const filteredRoutes = routes.filter(route => {
        if (route.label === 'Admin') {
            return user?.role === 'ADMIN'
        }
        return true
    })

    return (
        <div className={cn("space-y-4 py-4 flex flex-col h-full bg-slate-900 text-white", className)}>
            <div className="px-3 py-2 flex-1">
                <Link href="/" className="flex items-center pl-3 mb-14">
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
                        SchoolNet
                    </h1>
                </Link>
                <div className="space-y-1">
                    {filteredRoutes.map((route) => (
                        <Link
                            key={route.href}
                            href={route.href}
                            className={cn(
                                "text-sm group flex p-3 w-full justify-start font-medium cursor-pointer hover:text-white hover:bg-white/10 rounded-lg transition",
                                pathname === route.href ? "text-white bg-white/10" : "text-zinc-400"
                            )}
                        >
                            <div className="flex items-center flex-1">
                                <route.icon className={cn("h-5 w-5 mr-3", route.color)} />
                                {route.label}
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
            <div className="px-3 py-2">
                {user && (
                    <div className="mb-4 px-3 py-2 bg-white/5 rounded-lg">
                        <p className="text-sm font-medium text-white">{user.name || user.email}</p>
                        <p className="text-xs text-zinc-400 capitalize">{user.role?.toLowerCase()}</p>
                    </div>
                )}
                <form action={async () => {
                    await logout()
                }}>
                    <Button variant="ghost" className="w-full justify-start text-zinc-400 hover:text-white hover:bg-white/10">
                        <LogOut className="h-5 w-5 mr-3" />
                        Logout
                    </Button>
                </form>
            </div>
        </div>
    )
}

interface MobileSidebarProps {
    user?: SidebarProps['user']
}

export function MobileSidebar({ user }: MobileSidebarProps) {
    return (
        <Sheet>
            <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden text-white">
                    <Menu />
                </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 bg-slate-900 border-none text-white w-72">
                <Sidebar user={user} />
            </SheetContent>
        </Sheet>
    )
}
