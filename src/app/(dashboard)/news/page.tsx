import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { prisma } from "@/lib/prisma"

export default async function NewsArchivePage() {
    const newsList = await prisma.news.findMany({
        orderBy: { createdAt: 'desc' },
        where: { published: true },
        include: { author: true }
    })

    return (
        <div className="space-y-6">
            <h2 className="text-3xl font-bold tracking-tight">News Archive</h2>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {newsList.map((news) => (
                    <Card key={news.id} className="flex flex-col">
                        <CardHeader>
                            <CardTitle className="line-clamp-2">{news.title}</CardTitle>
                            <CardDescription>
                                {news.createdAt.toLocaleDateString()} by {news.author?.name || 'Admin'}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex-1">
                            <p className="text-sm text-muted-foreground line-clamp-4 whitespace-pre-wrap">
                                {news.content}
                            </p>
                        </CardContent>
                    </Card>
                ))}

                {newsList.length === 0 && (
                    <div className="col-span-full py-10 text-center text-muted-foreground">
                        No news found in the archive.
                    </div>
                )}
            </div>
        </div>
    )
}
