const Long = require('long')
const { Parser } = require('@gmod/binary-parser')
// const VirtualOffset = require('./virtualOffset')
const Chunk = require('./chunk')

const BAI_MAGIC = 21578050 // BAI\1
const { longToNumber } = require('./util')

class BAI {
  /**
   * @param {filehandle} filehandle
   * @param {function} [renameRefSeqs]
   */
  constructor({ filehandle, renameRefSeqs = n => n }) {
    this.filehandle = filehandle
    this.renameRefSeq = renameRefSeqs
  }

  _findFirstData(data, virtualOffset) {
    const currentFdl = data.firstDataLine
    if (currentFdl) {
      data.firstDataLine =
        currentFdl.compareTo(virtualOffset) > 0 ? virtualOffset : currentFdl
    } else {
      data.firstDataLine = virtualOffset
    }
  }

  async lineCount(refId) {
    const index = (await this.parse()).indices[refId]
    if (!index) {
      return -1
    }
    const ret = index.stats || {}
    return ret.lineCount === undefined ? -1 : ret.lineCount
  }

  async detectEndianness() {
    const buf = Buffer.allocUnsafe(4)
    await this.filehandle.read(buf, 0, 4, 0)
    let ret = buf.readInt32LE(0)
    if (ret === BAI_MAGIC) {
      this.isBigEndian = false
      return
    }
    ret = buf.readInt32BE(0)
    if (ret === BAI_MAGIC) {
      this.isBigEndian = true
      return
    }
    throw new Error('not a BAI file')
  }

  // memoize
  // fetch and parse the index
  async parse() {
    const data = { bai: true, maxBlockSize: 1 << 16 }
    await this.detectEndianess
    const le = this.isBigEndian ? 'big' : 'little'

    const bytes = await this.filehandle.readFile()
    const p = new Parser()
      .endianess(le)
      .uint32('magic')
      .int32('n_ref')
      .array('indices', {
        length: 'n_ref',
        type: new Parser()
          .int32('n_bin')
          .array('binIndex', {
            length: 'n_bin',
            type: new Parser()
              .uint32('bin')
              .int32('n_chunk')
              .array('chunks', {
                length: 'n_chunk',
                type: new Parser()
                  .buffer('u', { length: 8 })
                  .buffer('v', { length: 8 }),
              }),
          })
          .int32('n_intv')
          .array('intervals', {
            length: 'n_intv',
            type: new Parser().buffer('interval', { length: 8 }),
          }),
      })
    const ret = p.parse(bytes).result
    ret.bai = true
    ret.maxBlockSize = 1 << 16

    // parse pseudo bins
    const depth = 5
    const binLimit = ((1 << ((depth + 1) * 3)) - 1) / 7
    ret.indices && ret.indices.forEach(index => {
      index.bins && index.bins.forEach(bin => {
        if (bin.bin > binLimit) {
          index.stats = {
            lineCount: longToNumber(Long.fromBytesLE(bin.chunks[1].u)),
          }
        }
      })
    })

    return ret
  }

  async blocksForRange(refId, beg, end) {
    if (beg < 0) beg = 0

    const indexData = await this.parse()
    if (!indexData) return []
    const indexes = indexData.indices[refId]
    if (!indexes) return []

    const { binIndex } = indexes

    const bins = this.reg2bins(beg, end)
    console.log(binIndex,bins)

    let l
    let numOffsets = 0
    for (let i = 0; i < bins.length; i += 1) {
      if (binIndex[bins[i]]) {
        numOffsets += binIndex[bins[i]].length
      }
    }

    if (numOffsets === 0) return []

    let off = []
    numOffsets = 0
    for (let i = 0; i < bins.length; i += 1) {
      const chunks = binIndex[bins[i]]
      if (chunks)
        for (let j = 0; j < chunks.length; j += 1) {
          off[numOffsets] = new Chunk(
            chunks[j].minv,
            chunks[j].maxv,
            chunks[j].bin,
          )
          numOffsets += 1
        }
    }

    if (!off.length) return []

    off = off.sort((a, b) => a.compareTo(b))

    // resolve completely contained adjacent blocks
    l = 0
    for (let i = 1; i < numOffsets; i += 1) {
      if (off[l].maxv.compareTo(off[i].maxv) < 0) {
        l += 1
        off[l].minv = off[i].minv
        off[l].maxv = off[i].maxv
      }
    }
    numOffsets = l + 1

    // resolve overlaps between adjacent blocks; this may happen due to the merge in indexing
    for (let i = 1; i < numOffsets; i += 1)
      if (off[i - 1].maxv.compareTo(off[i].minv) >= 0)
        off[i - 1].maxv = off[i].minv
    // merge adjacent blocks
    l = 0
    for (let i = 1; i < numOffsets; i += 1) {
      if (off[l].maxv.blockPosition === off[i].minv.blockPosition)
        off[l].maxv = off[i].maxv
      else {
        l += 1
        off[l].minv = off[i].minv
        off[l].maxv = off[i].maxv
      }
    }
    numOffsets = l + 1

    return off.slice(0, numOffsets)
  }

  /**
   * @param {number} seqId
   * @returns {Promise} true if the index contains entries for
   * the given reference sequence ID, false otherwise
   */
  async hasRefSeq(seqId) {
    return !!((await this.parse()).indices[seqId] || {}).binIndex
  }

  /**
   * calculate the list of bins that may overlap with region [beg,end) (zero-based half-open)
   * @returns {Array[number]}
   */
  reg2bins(beg, end) {
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
}

// this is the stupidest possible memoization, ignores arguments.
function tinyMemoize(_class, methodName) {
  const method = _class.prototype[methodName]
  if (!method)
    throw new Error(`no method ${methodName} found in class ${_class.name}`)
  const memoAttrName = `_memo_${methodName}`
  _class.prototype[methodName] = function _tinyMemoized() {
    if (!(memoAttrName in this)) this[memoAttrName] = method.call(this)
    return this[memoAttrName]
  }
}
// memoize index.parse()
tinyMemoize(BAI, 'parse')

module.exports = BAI
