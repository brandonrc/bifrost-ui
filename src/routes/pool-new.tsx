import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'

import { PageHeader } from '@/components/page-header'
import { PairEditor } from '@/components/pair-editor'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import type { PoolFormState } from '@/lib/pools'
import {
  buildCreatePool,
  emptyFlavor,
  emptyPoolForm,
  validatePoolForm,
} from '@/lib/pools'

/**
 * New-pool form (api-v1.md §5.12). Admin-only on the backend (Write on
 * Target::Pool); the route itself renders read-only for everyone because
 * the form is unreachable without the gated "New pool" affordance — the
 * backend 403 is the hard boundary.
 */
export function PoolNewPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [state, setState] = useState<PoolFormState>(emptyPoolForm())
  const [errors, setErrors] = useState<string[]>([])

  const mutation = useMutation({
    mutationFn: () => api.createPool(buildCreatePool(state).spec),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pools'] })
      navigate(`/pools/${state.name.trim()}`)
    },
    // 400 invalid_spec / 409 conflict bodies surface verbatim (MobulaApiError
    // already extracts the backend's message field).
    onError: (err) => {
      setErrors([err instanceof Error ? err.message : String(err)])
    },
  })

  const patch = (patch: Partial<PoolFormState>) =>
    setState((prev) => ({ ...prev, ...patch }))

  const patchFlavor = (index: number, flavorPatch: Partial<PoolFormState['flavors'][number]>) =>
    setState((prev) => ({
      ...prev,
      flavors: prev.flavors.map((f, i) => (i === index ? { ...f, ...flavorPatch } : f)),
    }))

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const validationErrors = validatePoolForm(state)
    setErrors(validationErrors)
    if (validationErrors.length === 0) mutation.mutate()
  }

  return (
    <>
      <PageHeader
        title="New pool"
        description="A pool is flavors (hardware + nominal quotas) joined to a Kueue cohort for elastic borrowing (ADR-0010)."
      />

      <form onSubmit={onSubmit} className="max-w-2xl space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Basics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="block space-y-1">
              <span className="text-sm text-muted-foreground">Name</span>
              <Input
                value={state.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="gpu-pool"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-muted-foreground">Cohort</span>
              <Input
                value={state.cohort}
                onChange={(e) => patch({ cohort: e.target.value })}
                placeholder="team-cohort"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-muted-foreground">
                Fair-sharing weight
              </span>
              <Input
                value={state.fairSharingWeight}
                onChange={(e) => patch({ fairSharingWeight: e.target.value })}
                inputMode="decimal"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={state.elastic}
                onChange={(e) => patch({ elastic: e.target.checked })}
              />
              Elastic — workloads may be resized (Kueue elastic jobs)
            </label>
          </CardContent>
        </Card>

        {state.flavors.map((flavor, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Flavor {i + 1}</CardTitle>
              {state.flavors.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    patch({ flavors: state.flavors.filter((_, j) => j !== i) })
                  }
                >
                  Remove
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="block space-y-1">
                <span className="text-sm text-muted-foreground">
                  Flavor name
                </span>
                <Input
                  value={flavor.name}
                  onChange={(e) => patchFlavor(i, { name: e.target.value })}
                  placeholder="a100-40gb"
                />
              </label>
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground">
                  Resource quotas (K8s quantities — cover every resource a
                  workload requests, including memory)
                </span>
                <PairEditor
                  rows={flavor.resources}
                  onChange={(resources) => patchFlavor(i, { resources })}
                  keyPlaceholder="cpu or nvidia.com/gpu"
                  valuePlaceholder="8"
                  addLabel="Add resource"
                />
              </div>
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground">
                  Node labels (optional)
                </span>
                <PairEditor
                  rows={flavor.nodeLabels}
                  onChange={(nodeLabels) => patchFlavor(i, { nodeLabels })}
                  keyPlaceholder="cloud.google.com/gke-accelerator"
                  valuePlaceholder="nvidia-tesla-a100"
                  addLabel="Add node label"
                />
              </div>
            </CardContent>
          </Card>
        ))}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => patch({ flavors: [...state.flavors, emptyFlavor()] })}
        >
          <Plus /> Add flavor
        </Button>

        {errors.length > 0 ? (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3">
            <ul className="list-inside list-disc space-y-1 text-sm text-destructive">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={mutation.isPending}>
            {mutation.isPending ? 'Creating…' : 'Create pool'}
          </Button>
          <Button asChild type="button" variant="outline" size="sm">
            <Link to="/pools">Cancel</Link>
          </Button>
        </div>
      </form>
    </>
  )
}
