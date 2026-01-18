'use server'

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

const NewsSchema = z.object({
    title: z.string().min(3, "Title too short"),
    content: z.string().min(10, "Content too short"),
    published: z.boolean().default(true),
})

export async function createNews(formData: FormData) {
    const title = formData.get("title") as string
    const content = formData.get("content") as string
    const published = formData.get("published") === "on"

    const result = NewsSchema.safeParse({ title, content, published })

    if (!result.success) {
        return { error: result.error.flatten() }
    }

    // TODO: Get real current user ID from session
    // For now, we fetch the first admin/user found or hardcode for dev if auth serves no user
    const author = await prisma.user.findFirst({
        where: { role: 'ADMIN' } // Uses string 'ADMIN'
    })

    if (!author) {
        return { error: "No authorized user found to map as author." }
    }

    try {
        await prisma.news.create({
            data: {
                title: result.data.title,
                content: result.data.content,
                published: result.data.published,
                authorId: author.id,
            },
        })
    } catch (e) {
        console.error("Failed to create news:", e)
        return { error: "Database error" }
    }

    revalidatePath("/")
    revalidatePath("/news")
    redirect("/")
}
