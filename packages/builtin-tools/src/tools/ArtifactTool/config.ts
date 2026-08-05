/**
 * Cloud Artifacts service configuration.
 *
 * There is deliberately no default host. Publishing an artifact uploads the
 * user's content to whatever server this points at, and the previous default
 * — a Cloudflare Worker run by the upstream project, reached with a shared
 * hardcoded token — meant an unconfigured install silently put user content
 * on a stranger's infrastructure under a token everyone else was also using.
 *
 * Artifacts need a host and there is no host we can honestly pick on the
 * user's behalf, so the tool asks for one instead of guessing. The service is
 * open source and self-hostable; see packages/cloud-artifacts.
 */

const URL_ENV = 'CLAUDE_ARTIFACTS_URL'
const TOKEN_ENV = 'CLAUDE_ARTIFACTS_TOKEN'

/** Thrown when the tool is used before a host has been configured. */
export class ArtifactsNotConfiguredError extends Error {
  constructor() {
    super(
      `Artifact publishing has no host configured. Set ${URL_ENV} (and ` +
        `${TOKEN_ENV} if your deployment needs one) to a Cloud Artifacts ` +
        `service you control — see packages/cloud-artifacts to run your own.`,
    )
    this.name = 'ArtifactsNotConfiguredError'
  }
}

export function getArtifactsToken(): string {
  return process.env[TOKEN_ENV] ?? ''
}

export function isArtifactsConfigured(): boolean {
  return (process.env[URL_ENV] ?? '').trim() !== ''
}

export function getArtifactsBaseUrl(): string {
  const url = (process.env[URL_ENV] ?? '').trim()
  if (url === '') throw new ArtifactsNotConfiguredError()
  return url
}

/** Strip trailing slash so `${base}/upload` is well-formed. */
export function getUploadUrl(): string {
  const base = getArtifactsBaseUrl()
  return base.endsWith('/') ? `${base}upload` : `${base}/upload`
}
