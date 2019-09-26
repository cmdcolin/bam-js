import Chunk from "./chunk"
export function longToNumber(long: Long) {
  if (
    long.greaterThan(Number.MAX_SAFE_INTEGER) ||
    long.lessThan(Number.MIN_SAFE_INTEGER)
  ) {
    throw new Error("integer overflow")
  }
  return long.toNumber()
}

/**
 * Properly check if the given AbortSignal is aborted.
 * Per the standard, if the signal reads as aborted,
 * this function throws either a DOMException AbortError, or a regular error
 * with a `code` attribute set to `ERR_ABORTED`.
 *
 * For convenience, passing `undefined` is a no-op
 *
 * @param {AbortSignal} [signal] an AbortSignal, or anything with an `aborted` attribute
 * @returns nothing
 */
export function checkAbortSignal(signal?: AbortSignal) {
  if (!signal) return

  if (signal.aborted) {
    // console.log('bam aborted!')
    if (typeof DOMException !== "undefined")
      // eslint-disable-next-line  no-undef
      throw new DOMException("aborted", "AbortError")
    else {
      const e = new Error("aborted")
      //@ts-ignore
      e.code = "ERR_ABORTED"
      throw e
    }
  }
}

/**
 * Skips to the next tick, then runs `checkAbortSignal`.
 * Await this to inside an otherwise synchronous loop to
 * provide a place to break when an abort signal is received.
 * @param {AbortSignal} signal
 */
export async function abortBreakPoint(signal?: AbortSignal) {
  await Promise.resolve()
  checkAbortSignal(signal)
}

export function canMergeBlocks(block1: Chunk, block2: Chunk) {
  return (
    block1.minv.blockPosition === block1.maxv.blockPosition &&
    block1.maxv.blockPosition === block2.minv.blockPosition &&
    block2.minv.blockPosition === block2.maxv.blockPosition
  )
}