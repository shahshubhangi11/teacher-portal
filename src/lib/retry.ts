/**
 * Wraps an async AI call with automatic rate-limit retry.
 *
 * Handles both Groq and Gemini rate-limit error messages:
 *   Groq:   "Please try again in 12.5s"
 *   Gemini: "Please retry in 46.8s"
 *
 * When a rate-limit error is detected this helper:
 *  1. Calls onCountdown(s) every second so the UI can show a live countdown
 *  2. Waits the suggested time (+ 1 s buffer)
 *  3. Retries the call once automatically
 */
export async function callWithRetry<T>(
  fn: () => Promise<T>,
  onCountdown?: (remainingSeconds: number) => void,
): Promise<T> {
  const parseWait = (msg: string): number | null => {
    // Groq:   "Please try again in 12.544s"
    // Gemini: "Please retry in 46.843s"
    const m = msg.match(/(?:retry|try again) in (\d+(\.\d+)?)s/i)
    return m ? Math.ceil(parseFloat(m[1])) + 1 : null
  }

  try {
    return await fn()
  } catch (e: any) {
    const secs = parseWait(e?.message ?? '')
    if (secs == null) throw e   // not a rate-limit error

    for (let s = secs; s > 0; s--) {
      onCountdown?.(s)
      await new Promise<void>(r => setTimeout(r, 1_000))
    }
    return fn()  // one retry
  }
}
