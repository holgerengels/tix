import { CreateNewsForm } from "@/components/modules/news/create-news-form"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

export default function NewNewsPage() {
    return (
        <div className="max-w-2xl mx-auto py-6">
            <Card>
                <CardHeader>
                    <CardTitle>Create News Announcement</CardTitle>
                    <CardDescription>Post a new update to the school dashboard.</CardDescription>
                </CardHeader>
                <CardContent>
                    <CreateNewsForm />
                </CardContent>
            </Card>
        </div>
    )
}
