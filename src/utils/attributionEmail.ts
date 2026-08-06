/**
 * The email that goes in a commit's `Co-Authored-By:` trailer.
 *
 * Git requires an address in that trailer, but there is no honest address to
 * give for a third-party model. Upstream filled the gap with nine addresses at
 * its own domain — `openai@claude-code-best.win` and friends — with a comment
 * saying they were placeholders until something better turned up. Inherited
 * unchanged, that put another project's domain into the permanent public git
 * history of anyone using a non-Claude model through this fork.
 *
 * So: `.invalid` (RFC 2606), a TLD guaranteed never to resolve. It claims no
 * domain, impersonates no organisation, and cannot deliver mail to a stranger.
 * The informative half of the trailer is the model name, which sits next to it
 * and is unaffected.
 *
 * Claude keeps `noreply@anthropic.com` because that address is real and is
 * what Anthropic itself uses.
 */

const ANTHROPIC_NOREPLY = 'noreply@anthropic.com'

/** Structurally undeliverable: `.invalid` can never be registered. */
const UNATTRIBUTABLE = 'noreply@model.invalid'

export function getAttributionEmail(modelName: string): string {
  return modelName.toLowerCase().includes('claude')
    ? ANTHROPIC_NOREPLY
    : UNATTRIBUTABLE
}
