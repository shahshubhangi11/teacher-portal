/**
 * Wraps an async AI call with automatic rate-limit retry.
 *
 * When Gemini responds with "Please retry in Xs", this helper:
 *  1. Calls onCountdown(s) every second so the UI can show a live countdown
 *  2. Waits the suggested time (+ 1 s buffer)
 *  3. Retries the call once more automatically
 *
 * Usage:
 *   const result = await callWithRetry(
 *     () => generateQuiz(params),
 *     (s) => toast.loading(`Rate limited — retrying in ${s}s…`, { id: 'rl' }),
 *   )
 *   toast.dismiss('rl')
 */
export async function callWithRetry<T>(
  fn: () => Promise<T>,
  onCountdown?: (remainingSeconds: number) => void,
): Promise<T> {
  const parseRetry = (msg: string): number | null => {
    const m = msg.match(/retry in (\d+(\.\d+)?)s/i)
    return m ? Math.ceil(parseFloat(m[1])) + 1 : null
  }

  try {
    return await fn()
  } catch (e: any) {
    const secs = parseRetry(e?.message ?? '')
    if (secs == null) throw e          // not a rate-limit error — rethrow immediately

    // Countdown
    for (let s = secs; s > 0; s--) {
      onCountdown?.(s)
      await new Promise<void>(r => setTimeout(r, 1_000))
    }

    // One retry after the wait
    return fn()
  }
}
