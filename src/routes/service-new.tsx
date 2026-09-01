import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Lock } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'

import { useCanManageServices } from '@/auth/permissions'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import type { ServiceFormState } from '@/lib/service-form'
import {
  buildDeployService,
  emptyServiceForm,
  validateServiceForm,
} from '@/lib/service-form'
import { cn } from '@/lib/utils'

/**
 * Deploy-service form, backed by the implemented `POST /api/v1/services`.
 * Mirrors `ServiceSpec` exactly; `serve_config_v2` is a verbatim YAML
 * passthrough (Bifrost never interprets it), so a monospace textarea is the
 * right editor for v0. POST returns 202 — KubeRay's RayService controller
 * owns the rollout from there.
 *
 * Developer/Admin only (Write on Target::Service): the route renders a
 * permission gate for Operator/Viewer instead of the form; the backend 403
 * is the hard boundary.
 */
export function ServiceNewPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const canManage = useCanManageServices()
  const [state, setState] = useState<ServiceFormState>(emptyServiceForm())
  const [errors, setErrors] = useState<string[]>([])

  const mutation = useMutation({
    mutationFn: () => api.deployService(buildDeployService(state)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] })
      navigate(`/services/${state.name.trim()}`)
    },
    // Backend error bodies (400 invalid spec, 502 service backend error)
    // surface verbatim — BifrostApiError carries the plain-text message.
    onError: (err) => {
      setErrors([err instanceof Error ? err.message : String(err)])
    },
  })

  const patch = (patch: Partial<ServiceFormState>) =>
    setState((prev) => ({ ...prev, ...patch }))

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const validationErrors = validateServiceForm(state)
    setErrors(validationErrors)
    if (validationErrors.length === 0) mutation.mutate()
  }

  if (!canManage) {
    return (
      <>
        <PageHeader
          title="Deploy service"
          description="Declarative spec in, KubeRay rolls it out."
        />
        <EmptyState
          icon={Lock}
          title="Developer or Admin role required"
          description="Deploying a service requires Write on the service target — deploying is code, so Operators and Viewers have read-only access to services."
          action={
            <Button asChild size="sm" variant="outline">
              <Link to="/services">Back to services</Link>
            </Button>
          }
        />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Deploy service"
        description="A Ray Serve application as a KubeRay RayService. KubeRay owns convergence and the rollout strategy from here."
      />

      <form onSubmit={onSubmit} className="max-w-2xl space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Basics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="block space-y-1">
              <span className="text-sm text-muted-foreground">
                Service name (stable — also the RayService name)
              </span>
              <Input
                value={state.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="summarizer"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-muted-foreground">Project</span>
              <Input
                value={state.project}
                onChange={(e) => patch({ project: e.target.value })}
                placeholder="proj-a"
              />
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Runtime</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-sm text-muted-foreground">Ray version</span>
              <Input
                value={state.rayVersion}
                onChange={(e) => patch({ rayVersion: e.target.value })}
                placeholder="2.57.0"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-muted-foreground">Image</span>
              <Input
                value={state.image}
                onChange={(e) => patch({ image: e.target.value })}
                placeholder="rayproject/ray:2.57.0"
              />
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Head node</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-sm text-muted-foreground">
                CPU (K8s quantity)
              </span>
              <Input
                value={state.headCpu}
                onChange={(e) => patch({ headCpu: e.target.value })}
                placeholder="2"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-muted-foreground">
                Memory (K8s quantity)
              </span>
              <Input
                value={state.headMemory}
                onChange={(e) => patch({ headMemory: e.target.value })}
                placeholder="8Gi"
              />
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Workers</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <label className="block space-y-1">
              <span className="text-sm text-muted-foreground">Replicas</span>
              <Input
                value={state.workerReplicas}
                onChange={(e) => patch({ workerReplicas: e.target.value })}
                inputMode="numeric"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-muted-foreground">CPU</span>
              <Input
                value={state.workerCpu}
                onChange={(e) => patch({ workerCpu: e.target.value })}
                placeholder="4"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-muted-foreground">Memory</span>
              <Input
                value={state.workerMemory}
                onChange={(e) => patch({ workerMemory: e.target.value })}
                placeholder="16Gi"
              />
            </label>
            <p className="text-xs text-muted-foreground sm:col-span-3">
              Fixed replica count — autoscaling of Serve deployments is Ray
              Serve's own concern, not Bifrost's.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Upgrade strategy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <select
              value={state.upgrade}
              onChange={(e) =>
                patch({ upgrade: e.target.value as ServiceFormState['upgrade'] })
              }
              className={cn(
                'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              )}
            >
              <option value="canary">
                Canary — zero-downtime, KubeRay spins up a new cluster and
                shifts traffic
              </option>
              <option value="in_place">
                In-place — update the existing cluster in place
              </option>
            </select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Serve config (serve_config_v2 YAML)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <textarea
              value={state.serveConfigV2}
              onChange={(e) => patch({ serveConfigV2: e.target.value })}
              rows={12}
              spellCheck={false}
              className={cn(
                'flex w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              )}
            />
            <p className="text-xs text-muted-foreground">
              Passed through to KubeRay verbatim — Bifrost does not interpret
              it.
            </p>
          </CardContent>
        </Card>

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
            {mutation.isPending ? 'Deploying…' : 'Deploy service'}
          </Button>
          <Button asChild type="button" variant="outline" size="sm">
            <Link to="/services">Cancel</Link>
          </Button>
        </div>
      </form>
    </>
  )
}
