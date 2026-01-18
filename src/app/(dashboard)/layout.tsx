import { Sidebar, MobileSidebar } from "@/components/layouts/sidebar"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const session = await auth()

    if (!session) {
        // redirect("/login") // Commented out for dev preview if auth not fully set up
    }

    return (
        <div className="h-full relative">
            <div className="hidden h-full md:flex md:w-72 md:flex-col md:fixed md:inset-y-0 z-[80] bg-gray-900">
                <Sidebar user={session?.user} />
            </div>
            <main className="md:pl-72 h-full bg-slate-50 min-h-screen">
                <div className="flex items-center p-4 md:hidden bg-slate-900 text-white">
                    <MobileSidebar user={session?.user} />
                    <span className="ml-4 font-bold">SchoolNet</span>
                </div>
                <div className="p-8">
                    {children}
                </div>
            </main>
        </div>
    )
}
