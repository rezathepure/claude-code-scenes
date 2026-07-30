import * as React from 'react';
import { useLayoutEffect } from 'react';
import { PassThrough } from 'stream';
import stripAnsi from 'strip-ansi';
import { wrappedRender as render, useApp } from '@anthropic/ink';

// This is a workaround for the fact that Ink doesn't support multiple <Static>
// components in the same render tree. Instead of using a <Static> we just render
// the component to a string and then print it to stdout

/**
 * Wrapper component that exits after rendering.
 * Uses useLayoutEffect to ensure we wait for React's commit phase to complete
 * before exiting. This is more robust than process.nextTick() for React 19's
 * async render cycle.
 */
function RenderOnceAndExit({ children }: { children: React.ReactNode }): React.ReactNode {
  const { exit } = useApp();

  // useLayoutEffect runs synchronously after React commits DOM mutations.
  // setTimeout(0) defers exit to allow Ink to flush output to the stream.
  useLayoutEffect(() => {
    const timer = setTimeout(exit, 0);
    return () => clearTimeout(timer);
  }, [exit]);

  return <>{children}</>;
}

/**
 * How long to wait for Ink to unmount before taking the frame and moving on.
 *
 * Comfortably longer than a real render (single-digit milliseconds) and
 * comfortably shorter than bun test's 5s per-test timeout, so a tree that
 * cannot exit produces a readable assertion failure rather than a timeout with
 * nothing to go on.
 */
const EXIT_DEADLINE_MS = 2000;

// DEC synchronized update markers used by terminals
const SYNC_START = '\x1B[?2026h';
const SYNC_END = '\x1B[?2026l';

/**
 * Extracts content from the first complete frame in Ink's output.
 * Ink with non-TTY stdout outputs multiple frames, each wrapped in DEC synchronized
 * update sequences ([?2026h ... [?2026l). We only want the first frame's content.
 */
function extractFirstFrame(output: string): string {
  const startIndex = output.indexOf(SYNC_START);
  if (startIndex === -1) return output;

  const contentStart = startIndex + SYNC_START.length;
  const endIndex = output.indexOf(SYNC_END, contentStart);
  if (endIndex === -1) return output;

  return output.slice(contentStart, endIndex);
}

/**
 * Renders a React node to a string with ANSI escape codes (for terminal output).
 */
export async function renderToAnsiString(node: React.ReactNode, columns?: number): Promise<string> {
  let output = '';

  // Capture all writes. Set .columns so Ink (ink.tsx:~165) picks up a
  // chosen width instead of PassThrough's undefined → 80 fallback —
  // useful for rendering at terminal width for file dumps that should
  // match what the user sees on screen.
  const stream = new PassThrough();
  if (columns !== undefined) {
    (stream as unknown as { columns: number }).columns = columns;
  }
  stream.on('data', chunk => {
    output += chunk.toString();
  });

  // Render the component wrapped in RenderOnceAndExit
  // Non-TTY stdout (PassThrough) gives full-frame output instead of diffs
  const instance = await render(<RenderOnceAndExit>{node}</RenderOnceAndExit>, {
    stdout: stream as unknown as NodeJS.WriteStream,
    patchConsole: false,
  });

  // Wait for the component to exit naturally — but never forever.
  //
  // The frame is already on the stream by the time React commits; the only
  // thing that can hang here is the exit. Anything the tree mounts that holds
  // the event loop — a stdin listener from useInput, an interval, a component
  // that never settles — leaves waitUntilExit unresolved, and the caller waits
  // with a complete frame sitting in `output`. That is how a rendered
  // component turns into a frozen `/context`, and how these helpers turned
  // into 5-second test timeouts on CI while passing locally.
  //
  // Capping it costs nothing when exit works (the race resolves immediately)
  // and turns the failure into something legible everywhere else: whatever was
  // rendered, returned, plus an unmount so the process can still exit.
  let exited = false;
  await Promise.race([
    instance.waitUntilExit().then(() => {
      exited = true;
    }),
    new Promise<void>(resolve => setTimeout(resolve, EXIT_DEADLINE_MS)),
  ]);
  if (!exited) {
    instance.unmount();
  }
  // Ink caches instances by stdout stream, and every call here passes a fresh
  // PassThrough — without this the map grows one dead entry per render.
  instance.cleanup();

  // Extract only the first frame's content to avoid duplication
  // (Ink outputs multiple frames in non-TTY mode)
  return extractFirstFrame(output);
}

/**
 * Renders a React node to a plain text string (ANSI codes stripped).
 */
export async function renderToString(node: React.ReactNode, columns?: number): Promise<string> {
  const output = await renderToAnsiString(node, columns);
  return stripAnsi(output);
}
