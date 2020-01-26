import Long from 'long'
import VirtualOffset, { fromBytes } from './virtualOffset'
import Chunk from './chunk'

import IndexFile, { Props } from './indexFile'
import { longToNumber, abortBreakPoint, canMergeBlocks } from './util'

const BAI_MAGIC = 21578050 // BAI\1

function roundDown(n: number, multiple: number) {
  return n - (n % multiple)
}
function roundUp(n: number, multiple: number) {
  return n - (n % multiple) + multiple
}

export default class BAI extends IndexFile {
  parsePseudoBin(bytes: Buffer, offset: number) {
    const lineCount = longToNumber(
      Long.fromBytesLE(
        Array.prototype.slice.call(bytes, offset + 16, offset + 24),
        true,
      ),
    )
    return { lineCount }
  }

  async lineCount(refId: number, props: { signal?: AbortSignal } = {}) {
    const index = (await this.parse(props)).indices[refId]
    if (!index) {
      return -1
    }
    const ret = index.stats || {}
    return ret.lineCount === undefined ? -1 : ret.lineCount
  }

  // fetch and parse the index
  async _parse(
    props: { signal?: AbortSignal; statusCallback?: Function } = {},
  ) {
    const { signal, statusCallback } = props
    const data: { [key: string]: any } = { bai: true, maxBlockSize: 1 << 16 }
    if (statusCallback) {
      statusCallback('Downloading index')
    }

    const bytes = (await this.filehandle.readFile(props)) as Buffer

    if (statusCallback) {
      statusCallback('Parsing index')
    }

    // check BAI magic numbers
    if (bytes.readUInt32LE(0) !== BAI_MAGIC) {
      throw new Error('Not a BAI file')
    }

    data.refCount = bytes.readInt32LE(4)
    const depth = 5
    const binLimit = ((1 << ((depth + 1) * 3)) - 1) / 7

    // read the indexes for each reference sequence
    data.indices = new Array(data.refCount)
    let currOffset = 8
    for (let i = 0; i < data.refCount; i += 1) {
      await abortBreakPoint(signal)

      // the binning index
      const binCount = bytes.readInt32LE(currOffset)
      let stats

      currOffset += 4
      const binIndex: { [key: number]: Chunk[] } = {}
      for (let j = 0; j < binCount; j += 1) {
        const bin = bytes.readUInt32LE(currOffset)
        currOffset += 4
        if (bin === binLimit + 1) {
          currOffset += 4
          stats = this.parsePseudoBin(bytes, currOffset)
          currOffset += 32
        } else if (bin > binLimit + 1) {
          throw new Error('bai index contains too many bins, please use CSI')
        } else {
          const chunkCount = bytes.readInt32LE(currOffset)
          currOffset += 4
          const chunks = new Array(chunkCount)
          for (let k = 0; k < chunkCount; k += 1) {
            const u = fromBytes(bytes, currOffset)
            const v = fromBytes(bytes, currOffset + 8)
            currOffset += 16
            this._findFirstData(data, u)
            chunks[k] = new Chunk(u, v, bin)
          }
          binIndex[bin] = chunks
        }
      }

      const linearCount = bytes.readInt32LE(currOffset)
      currOffset += 4
      // as we're going through the linear index, figure out
      // the smallest virtual offset in the indexes, which
      // tells us where the BAM header ends
      const linearIndex = new Array(linearCount)
      for (let k = 0; k < linearCount; k += 1) {
        linearIndex[k] = fromBytes(bytes, currOffset)
        currOffset += 8
        this._findFirstData(data, linearIndex[k])
      }

      data.indices[i] = { binIndex, linearIndex, stats }
    }

    return data
  }

  async indexCov(
    { seqId, start, end }: { seqId: number; start?: number; end?: number },
    props: Props,
  ): Promise<{ start: number; end: number; score: number }[]> {
    if (seqId === undefined) throw new Error('No seqId specified')

    const v = 16384
    const range = start !== undefined
    const indexData = await this.parse(props)
    const seqIdx = indexData.indices[seqId]
    if (!seqIdx) return []
    const { linearIndex = [], stats } = seqIdx
    if (!linearIndex.length) return []
    const e = end !== undefined ? roundUp(end, v) : (linearIndex.length - 1) * v
    const s = start !== undefined ? roundDown(start, v) : 0
    let depths
    if (range) {
      depths = new Array((e - s) / v)
    } else {
      depths = new Array(linearIndex.length - 1)
    }
    const totalSize = linearIndex[linearIndex.length - 1].blockPosition
    if (e > (linearIndex.length - 1) * v) {
      throw new Error('query outside of range of linear index')
    }
    let currentPos = linearIndex[s / v].blockPosition
    for (let i = s / v, j = 0; i < e / v; i++, j++) {
      depths[j] = {
        score: linearIndex[i + 1].blockPosition - currentPos,
        start: i * v,
        end: i * v + v,
      }
      currentPos = linearIndex[i + 1].blockPosition
    }
    return depths.map(d => {
      return { ...d, score: (d.score * stats.lineCount) / totalSize }
    })
  }

  /**
   * calculate the list of bins that may overlap with region [beg,end) (zero-based half-open)
   * @returns {Array[number]}
   */
  reg2bins(beg: number, end: number) {
    const list = [0]
    end -= 1
    for (let k = 1 + (beg >> 26); k <= 1 + (end >> 26); k += 1) list.push(k)
    for (let k = 9 + (beg >> 23); k <= 9 + (end >> 23); k += 1) list.push(k)
    for (let k = 73 + (beg >> 20); k <= 73 + (end >> 20); k += 1) list.push(k)
    for (let k = 585 + (beg >> 17); k <= 585 + (end >> 17); k += 1) list.push(k)
    for (let k = 4681 + (beg >> 14); k <= 4681 + (end >> 14); k += 1)
      list.push(k)
    return list
  }

  async blocksForRange(
    refId: number,
    min: number,
    max: number,
    props: { signal?: AbortSignal } = {},
  ) {
    if (min < 0) min = 0

    const indexData = await this.parse(props)
    if (!indexData) return []
    const ba = indexData.indices[refId]
    if (!ba) return []

    const overlappingBins = this.reg2bins(min, max) // List of bin #s that overlap min, max
    const chunks: Chunk[] = []

    // Find chunks in overlapping bins.  Leaf bins (< 4681) are not pruned
    overlappingBins.forEach(function(bin) {
      if (ba.binIndex[bin]) {
        const binChunks = ba.binIndex[bin]
        for (let c = 0; c < binChunks.length; ++c) {
          chunks.push(new Chunk(binChunks[c].minv, binChunks[c].maxv, bin))
        }
      }
    })

    // Use the linear index to find minimum file position of chunks that could contain alignments in the region
    const nintv = ba.linearIndex.length
    let lowest = null
    const minLin = Math.min(min >> 14, nintv - 1)
    const maxLin = Math.min(max >> 14, nintv - 1)
    for (let i = minLin; i <= maxLin; ++i) {
      const vp = ba.linearIndex[i]
      if (vp) {
        if (!lowest || vp.compareTo(lowest) < 0) {
          lowest = vp
        }
      }
    }

    return this.optimizeChunks(chunks, lowest)
  }

  optimizeChunks(chunks: Chunk[], lowest: VirtualOffset) {
    const mergedChunks: Chunk[] = []
    let lastChunk: Chunk | null = null

    if (chunks.length === 0) return chunks

    chunks.sort(function(c0, c1) {
      const dif = c0.minv.blockPosition - c1.minv.blockPosition
      if (dif !== 0) {
        return dif
      } else {
        return c0.minv.dataPosition - c1.minv.dataPosition
      }
    })

    chunks.forEach(chunk => {
      if (!lowest || chunk.maxv.compareTo(lowest) > 0) {
        if (lastChunk === null) {
          mergedChunks.push(chunk)
          lastChunk = chunk
        } else {
          if (canMergeBlocks(lastChunk, chunk)) {
            if (chunk.maxv.compareTo(lastChunk.maxv) > 0) {
              lastChunk.maxv = chunk.maxv
            }
          } else {
            mergedChunks.push(chunk)
            lastChunk = chunk
          }
        }
      }
      // else {
      //   console.log(`skipping chunk ${chunk}`)
      // }
    })

    return mergedChunks
  }
}
