import { getAssignmentRules, getTransitionRules } from "@/app/actions/workflow"
import { AssignmentMatrix } from "@/components/modules/admin/workflow/assignment-matrix"
import { TransitionMatrix } from "@/components/modules/admin/workflow/transition-matrix"
import { Separator } from "@/components/ui/separator"
import { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Workflow-Konfiguration',
    description: 'Verwalten Sie Regeln für Ticketzuweisungen und Statusübergänge.',
}

export default async function AdminWorkflowPage() {
    const [assignmentRules, transitionRules] = await Promise.all([
        getAssignmentRules(),
        getTransitionRules(),
    ])

    return (
        <div className="space-y-8 p-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Workflow-Konfiguration</h2>
                <p className="text-muted-foreground mt-2">
                    Verwalten Sie systemweite Regeln für Ticketzuweisungen und Statusübergänge.
                </p>
            </div>

            <Separator />

            <div className="space-y-4">
                <h3 className="text-xl font-semibold">Zuweisungsregeln</h3>
                <p className="text-sm text-muted-foreground mb-4">
                    Legen Sie fest, wer Tickets an wen zuweisen darf. <br />
                    <strong>Zeilen</strong> stehen für den Benutzer, der die Zuweisung vornimmt, und <strong>Spalten</strong> für die Rolle des Zielbenutzers.
                </p>
                <AssignmentMatrix initialRules={assignmentRules} />
            </div>

            <Separator />

            <div className="space-y-4">
                <h3 className="text-xl font-semibold">Statusübergangsregeln</h3>
                <p className="text-sm text-muted-foreground mb-4">
                    Definieren Sie erlaubte Statusänderungen für jede Rolle. Wählen Sie eine Rolle aus, um deren Übergangsberechtigungen anzuzeigen und zu bearbeiten.
                </p>
                <TransitionMatrix initialRules={transitionRules} />
            </div>
        </div>
    )
}
