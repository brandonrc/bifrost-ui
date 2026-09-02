import type { DeployService, UpgradeStrategy } from './api'
import { isValidQuantity } from './cluster-form'

// --- Deploy-service form state (route /services/new) ------------------------

export interface ServiceFormState {
  /** Stable service name — also the RayService name. */
  name: string
  project: string
  rayVersion: string
  image: string
  headCpu: string
  headMemory: string
  /** Kept as a string so the input can be empty/partial while typing. */
  workerReplicas: string
  workerCpu: string
  workerMemory: string
  upgrade: UpgradeStrategy
  /** KubeRay `serveConfigV2`, passed through verbatim as a YAML string. */
  serveConfigV2: string
}

/** Minimal Serve application skeleton the form starts from. */
const DEFAULT_SERVE_CONFIG = `applications:
  - name: app
    import_path: app:deployment
    runtime_env: {}
    deployments: []
`

export function emptyServiceForm(): ServiceFormState {
  return {
    name: '',
    project: '',
    rayVersion: '2.57.0',
    image: 'rayproject/ray:2.57.0',
    headCpu: '2',
    headMemory: '8Gi',
    workerReplicas: '2',
    workerCpu: '4',
    workerMemory: '16Gi',
    upgrade: 'canary',
    serveConfigV2: DEFAULT_SERVE_CONFIG,
  }
}

/** Client-side validation mirroring the backend's spec checks. */
export function validateServiceForm(state: ServiceFormState): string[] {
  const errors: string[] = []
  if (state.name.trim() === '') errors.push('Service name is required.')
  if (state.project.trim() === '') errors.push('Project is required.')
  if (state.rayVersion.trim() === '') errors.push('Ray version is required.')
  if (state.image.trim() === '') errors.push('Image is required.')
  if (!isValidQuantity(state.headCpu)) {
    errors.push(`Head CPU "${state.headCpu}" is not a valid quantity.`)
  }
  if (!isValidQuantity(state.headMemory)) {
    errors.push(`Head memory "${state.headMemory}" is not a valid quantity.`)
  }
  if (!isValidQuantity(state.workerCpu)) {
    errors.push(`Worker CPU "${state.workerCpu}" is not a valid quantity.`)
  }
  if (!isValidQuantity(state.workerMemory)) {
    errors.push(`Worker memory "${state.workerMemory}" is not a valid quantity.`)
  }
  if (!/^\d+$/.test(state.workerReplicas.trim())) {
    errors.push('Worker replicas must be a non-negative whole number.')
  }
  // Bifrost does not interpret serveConfigV2 (verbatim passthrough), but an
  // empty config would deploy a service that serves nothing.
  if (state.serveConfigV2.trim() === '') {
    errors.push('Serve config (serve_config_v2 YAML) is required.')
  }
  return errors
}

/** Convert validated form state into the `POST /api/v1/services` body. */
export function buildDeployService(state: ServiceFormState): DeployService {
  const name = state.name.trim()
  return {
    name,
    spec: {
      name,
      project: state.project.trim(),
      rayVersion: state.rayVersion.trim(),
      image: state.image.trim(),
      headCpu: state.headCpu.trim(),
      headMemory: state.headMemory.trim(),
      workerReplicas: Number(state.workerReplicas),
      workerCpu: state.workerCpu.trim(),
      workerMemory: state.workerMemory.trim(),
      upgrade: state.upgrade,
      serveConfigV2: state.serveConfigV2,
    },
  }
}
