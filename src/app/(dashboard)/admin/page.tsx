import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Newspaper, Users, Shield } from "lucide-react"

export default function AdminPage() {
    return (
        <div className="space-y-6">
            <h2 className="text-3xl font-bold tracking-tight">Admin-Dashboard</h2>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center">
                            <Newspaper className="mr-2 h-5 w-5" />
                            Nachrichtenverwaltung
                        </CardTitle>
                        <CardDescription>Verwalten Sie schulweite Ankündigungen.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Link href="/admin/news/new">
                            <Button className="w-full">Neuigkeit erstellen</Button>
                        </Link>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center">
                            <Users className="mr-2 h-5 w-5" />
                            Benutzerverwaltung
                        </CardTitle>
                        <CardDescription>Benutzer und Rollen verwalten (Demnächst)</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Link href="/admin/users">
                            <Button variant="secondary" className="w-full">Benutzer verwalten</Button>
                        </Link>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center">
                            <Shield className="mr-2 h-5 w-5" />
                            Workflow-Matrix
                        </CardTitle>
                        <CardDescription>Konfigurieren Sie Zuweisungs- und Übergangsregeln.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Link href="/admin/workflow">
                            <Button className="w-full" variant="outline">Workflows verwalten</Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
