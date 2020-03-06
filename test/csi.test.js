import { csi, BamFile } from '../src'

import { LocalFile } from 'generic-filehandle'
import FakeRecord from './fakerecord'

class HalfAbortController {
  constructor() {
    this.signal = { aborted: false }
  }

  abort() {
    this.signal.aborted = true
  }
}

describe('bam header', () => {
  it('loads volvox-sorted.bam', async () => {
    const ti = new BamFile({
      bamPath: require.resolve('./data/volvox-sorted.bam'),
    })
    await ti.getHeader()
    expect(ti.header).toEqual('@SQ	SN:ctgA	LN:50001\n')
    expect(ti.chrToIndex.ctgA).toEqual(0)
    expect(ti.indexToChr[0]).toEqual({ refName: 'ctgA', length: 50001 })
    const ret = await ti.indexCov({ seqName: 'ctgA' })
    expect(ret).toMatchSnapshot()
  })
  it('loads volvox-sorted.bam with csi index', async () => {
    const ti = new BamFile({
      bamPath: require.resolve('./data/volvox-sorted.bam'),
      csiPath: require.resolve('./data/volvox-sorted.bam.csi'),
    })
    await ti.getHeader()
    expect(ti.header).toEqual('@SQ	SN:ctgA	LN:50001\n')
    expect(ti.chrToIndex.ctgA).toEqual(0)
    expect(ti.indexToChr[0]).toEqual({ refName: 'ctgA', length: 50001 })
  })
})

describe('bam records', () => {
  let ti
  beforeEach(() => {
    ti = new BamFile({
      bamPath: require.resolve('./data/volvox-sorted.bam'),
    })
    return ti.getHeader()
  })
  it('gets features from volvox-sorted.bam', async () => {
    const records = await ti.getRecordsForRange('ctgA', 0, 1000)
    expect(records.length).toEqual(131)
    expect(records[0].get('start')).toEqual(2)
    expect(records[0].get('end')).toEqual(102)
    expect(records[0].get('cigar')).toEqual('100M')
    expect(records[0].get('name')).toEqual('ctgA_3_555_0:0:0_2:0:0_102d')
    expect(records[0].get('qual')).toEqual(
      '17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17 17',
    )
    expect(records[0].get('md')).toEqual('100')
    expect(records[0].getReadBases()).toEqual(
      'TTGTTGCGGAGTTGAACAACGGCATTAGGAACACTTCCGTCTCTCACTTTTATACGATTATGATTGGTTCTTTAGCCTTGGTTTAGATTGGTAGTAGTAG',
    )
  })
  it('gets features from the end of volvox-sorted.bam', async () => {
    const records = await ti.getRecordsForRange('ctgA', 47457, 50001)
    expect(records.length).toEqual(473)
  })
  it('gets out of bounds from volvox-sorted.bam', async () => {
    const records = await ti.getRecordsForRange('ctgA', 60000, 70000)
    expect(records.length).toEqual(0)
  })
  it('gets large chunk from volvox-sorted.bam', async () => {
    const promises = []
    const win = 1000
    for (let i = 0; i < 50000; i += win) {
      const records = ti.getRecordsForRange('ctgA', i, i + win)
      promises.push(records)
    }
    const recs = await Promise.all(promises)
    expect(recs.every(record => record.length > 0)).toBeTruthy()
  })

  it('gets specific weird chunk of volvox-sorted.bam', async () => {
    const records = await ti.getRecordsForRange('ctgA', 32749, 32799)
    expect(records.length).toEqual(13)
  })
  it('gets specific other weird chunk of volvox-sorted.bam', async () => {
    const records = await ti.getRecordsForRange('ctgA', 32799, 32849)
    expect(records.length).toEqual(11)
  })
})

describe('bam deep record check', () => {
  it('deep check volvox-sorted.bam', async () => {
    const ti = new BamFile({
      bamPath: require.resolve('./data/volvox-sorted.bam'),
    })
    await ti.getHeader()
    const records = await ti.getRecordsForRange('ctgA', 0, 10)
    expect(records).toMatchSnapshot()
  })
})

describe('1000 genomes bam check', () => {
  it('deep check 1000 genomes', async () => {
    const ti = new BamFile({
      bamPath: require.resolve('./data/1000genomes_hg00096_chr1.bam'),
      csiPath: require.resolve('./data/1000genomes_hg00096_chr1.bam.csi'),
    })
    await ti.getHeader()
    const records = await ti.getRecordsForRange('1', 0, 1000)
    expect(records).toMatchSnapshot()
  })
  it('deep check 1000 genomes csi', async () => {
    const ti = new BamFile({
      bamPath: require.resolve('./data/1000genomes_hg00096_chr1.bam'),
    })
    await ti.getHeader()
    const records = await ti.getRecordsForRange('1', 0, 1000)
    expect(records).toMatchSnapshot()
  })
  it('start to deep check 1000 genomes but abort instead', async () => {
    const aborter = new HalfAbortController()
    const ti = new BamFile({
      bamPath: require.resolve('./data/1000genomes_hg00096_chr1.bam'),
      csiPath: require.resolve('./data/1000genomes_hg00096_chr1.bam.csi'),
    })
    const recordsP = ti
      .getHeader(aborter.signal)
      .then(() => ti.getRecordsForRange('1', 0, 1000, { signal: aborter.signal }))
    aborter.abort()
    await expect(recordsP).rejects.toThrow(/aborted/)
  })
})

describe('ecoli bam check', () => {
  it('check ecoli header and records', async () => {
    const ti = new BamFile({
      bamPath: require.resolve('./data/ecoli_nanopore.bam'),
    })
    const header = await ti.getHeader()
    const records = await ti.getRecordsForRange('ref000001|chr', 0, 100)
    expect(header).toMatchSnapshot()
    expect(records).toMatchSnapshot()
  })
})
describe('BamFile with test_deletion_2_0.snps.bwa_align.sorted.grouped.bam', () => {
  let b
  beforeEach(async () => {
    b = new BamFile({
      bamPath: 'test/data/test_deletion_2_0.snps.bwa_align.sorted.grouped.bam',
    })
    await b.getHeader()
  })

  it('constructs', () => {
    expect(b).toBeTruthy()
  })

  it('loads some data', async () => {
    const features = await b.getRecordsForRange('Chromosome', 17000, 18000)
    expect(features.length).toEqual(124)
    expect(features.every(feature => feature.get('seq_length') === feature.getReadBases().length)).toBeTruthy()
  })
})

describe('BamFile tiny', () => {
  it('loads some data', async () => {
    const b = new BamFile({
      bamPath: 'test/data/tiny.bam',
    })
    await b.getHeader()
    const features = await b.getRecordsForRange('22', 30000000, 30010000)
    expect(features.length).toEqual(2)
  })
})

describe('BamFile secondary', () => {
  it('checks secondary', async () => {
    const b = new BamFile({
      bamPath: 'test/data/secondary.bam',
    })
    await b.getHeader()
    const features = await b.getRecordsForRange('20', 10761157, 10761387)
    const dups = features.map(f => f.isDuplicate()).reduce((x, y) => x + y)
    expect(dups).toEqual(2)
  })
})
describe('BamFile empty', () => {
  it('loads but does not crash', async () => {
    const b = new BamFile({
      bamPath: 'test/data/empty.bam',
    })
    await b.getHeader()
    const features = await b.getRecordsForRange('22', 30000000, 30010000)
    expect(features.length).toEqual(0)
  })
})

describe('BamFile with B tags', () => {
  it('test B tags', async () => {
    const b = new BamFile({
      bamPath: 'test/data/Btag.bam',
    })
    await b.getHeader()

    const features = await b.getRecordsForRange('chr1', 980654, 981663)
    // ZC:B:i,364,359,1,0    ZD:B:f,0.01,0.02,0.03   ZE:B:c,0,1,2,3  ZK:B:s,45,46,47
    const ret = features[1].get('ZD').split(',')
    expect(features[1].get('ZC')).toEqual('364,359,1,0')
    expect(features[1].get('ZE')).toEqual('0,1,2,3')
    expect(features[1].get('ZK')).toEqual('45,46,47')
    expect(+ret[0]).toBeCloseTo(0.01)
    expect(+ret[1]).toBeCloseTo(0.02)
    expect(+ret[2]).toBeCloseTo(0.03)
    expect(features.length).toEqual(2)
  })
})

describe('BamFile with paired ends', () => {
  it('paired ends', async () => {
    const b = new BamFile({
      bamPath: 'test/data/paired.bam',
    })
    await b.getHeader()

    const features = await b.getRecordsForRange('20', 62500, 64500)
    const f = features[0]
    expect(f._next_refid()).toEqual(19)
    expect(f._next_pos()).toEqual(62352)
  })
  it('read as pairs', async () => {
    const b = new BamFile({
      bamPath: 'test/data/paired.bam',
    })
    const p = new BamFile({
      bamPath: 'test/data/paired-region.bam',
    })

    await b.getHeader()
    await p.getHeader()

    const features = await b.getRecordsForRange('20', 62500, 64500, {
      viewAsPairs: true,
    })
    const features2 = await p.getRecordsForRange('20', 0, 70000)
    //    expect(features.length).toEqual(features2.length)
    expect(features.map(f => f.get('name')).sort()).toEqual(features2.map(f => f.get('name')).sort())
    const f = features[features.length - 1]
    const f2 = features2[features2.length - 1]
    expect(f.get('start')).toEqual(f2.get('start'))
  })
})

describe('BamFile+CSI with large coordinates', () => {
  it('use csi', async () => {
    const b = new BamFile({
      bamPath: 'test/data/large_coords.bam',
      csiPath: 'test/data/large_coords.bam.csi',
    })
    await b.getHeader()

    const features = await b.getRecordsForRange('ctgA', 1073741824, 1073741824 + 50000)
    expect(features.length).toEqual(9596)
  })
})

describe('Pair orientations', () => {
  it('test pair orientations', async () => {
    const b1 = new FakeRecord(true, 'F', 'F', 100)
    const b2 = new FakeRecord(true, 'F', 'R', 100)
    const b3 = new FakeRecord(true, 'R', 'R', 100)
    const b4 = new FakeRecord(true, 'R', 'F', 100)
    const b5 = new FakeRecord(false, 'F', 'F', 100)
    const b6 = new FakeRecord(false, 'F', 'R', 100)
    const b7 = new FakeRecord(false, 'R', 'R', 100)
    const b8 = new FakeRecord(false, 'R', 'F', 100)
    const b9 = new FakeRecord(false, 'F', 'F', -100)
    const b10 = new FakeRecord(false, 'F', 'R', -100)
    const b11 = new FakeRecord(false, 'R', 'R', -100)
    const b12 = new FakeRecord(false, 'R', 'F', -100)
    expect(b1.getPairOrientation()).toEqual('F1F2')
    expect(b2.getPairOrientation()).toEqual('F1R2')
    expect(b3.getPairOrientation()).toEqual('R1R2')
    expect(b4.getPairOrientation()).toEqual('R1F2')
    expect(b5.getPairOrientation()).toEqual('F2F1')
    expect(b6.getPairOrientation()).toEqual('F2R1')
    expect(b7.getPairOrientation()).toEqual('R2R1')
    expect(b8.getPairOrientation()).toEqual('R2F1')
    expect(b9.getPairOrientation()).toEqual('F1F2')
    expect(b10.getPairOrientation()).toEqual('R1F2')
    expect(b11.getPairOrientation()).toEqual('R1R2')
    expect(b12.getPairOrientation()).toEqual('F1R2')
  })
})

describe('SAM spec pdf', () => {
  it('check parse', async () => {
    const b = new BamFile({
      bamPath: 'test/data/samspec.bam',
      csiPath: 'test/data/samspec.bam.csi',
    })
    await b.getHeader()

    const features = await b.getRecordsForRange('ref', 1, 100)
    expect(features.length).toEqual(6)
    expect(features[2].get('sa')).toEqual('ref,29,-,6H5M,17,0;')
    expect(features[4].get('sa')).toEqual('ref,9,+,5S6M,30,1;')
  })
})
describe('trigger range out of bounds file', () => {
  it('range error', async () => {
    const b = new BamFile({
      bamPath: 'test/data/cho.bam',
    })
    await b.getHeader()
    expect(Object.keys(b.chrToIndex).length).toEqual(28751)
  })
})

// we cannot determine duplicates as unique because we require dehashing
test('unique id for duplicate features', async () => {
  const ti = new BamFile({
    bamPath: require.resolve('./data/exact_duplicate.bam'),
  })
  await ti.getHeader()
  const ret = await ti.getRecordsForRange('ctgA', 0, 1000)
  expect(ret[0].id() !== ret[1].id()).toBeTruthy()
})

test('usage of the chr22 ultralong nanopore', async () => {
  const ti = new BamFile({
    bamPath: require.resolve('./data/chr22_nanopore_subset.bam'),
  })
  await ti.getHeader()
  const ret1 = await ti.getRecordsForRange('22', 16559999, 16564499)
  const ret2 = await ti.getRecordsForRange('22', 16564499, 16564999)
  const findfeat = k => k.get('name') === '3d509937-5c54-46d7-8dec-c49c7165d2d5'
  const [r1, r2] = [ret1, ret2].map(x => x.find(findfeat))
  expect(r1.getReadBases()).toEqual(r2.getReadBases())
  expect(r1.getReadBases()).toBe(
    'TCTTCAGACCCTCGAAACAGTGTTCTGAAATCCTATGGCAGGGAACAACAGAACCCAGCCACTGTGTGCTGGAATCCTGTCTGAGGACAAACATTCAAACACTCATGAAAGTGTTCTGGAATCTTATGTGAGTGATAAGCAATCAGAAACCAGCAGCGGTGCTCTGTAATCCTTTGTGAGGACAAACAGTACACAGAGCAAGTTCTGGAGTTCTATGTGAGGGACAAACTCTCATGACAGCAGCAGTGTTCTGGAATCACTTGTGAGGGCCAAACACTCAGACTTATGCAGCAGTATTTACAGATCTTATGTGTGATGGAAAACACTCTGAACCCAGCAGCAGTGTTCTGGAATCCTATATGAGGAAAAACTCAGAACCTGCAGCAGTGTTCTGGAATCCTTAGTGAGGAGGTATTCAGAACCTCATATCAGTGTTATGGAATCGTATGTGAGGACAAACACTCTGAAACCAGCAGCAGTGTTCTGGAATCCCATGTGAGAGACAAACACGAGAATCCAGCAGCAGTATTCTGGAATCCTATGTGTGAAAACACCCAGAAACCAGCAGCGTAGTACTGGAAGGAAATCTTTGTTAGGGGCTAACATTCAGACACAAGCTGTATTCTGGAATCTATGTGAGGACAAACACTCCTATCAGTAGCAATGTTCTGCAATTCTTTAGCAGCAGACAACATCTTCAGGCCCTCATGCAGCAGTTTCAAAAATTCCACAAGAGTGAGAGATTAAACACTCCAGAACCCAGCAGAAATGCAGGGATCTATGTGAGGGCAAATACTTGGAATCCAGCAGCACTGTTCTTGAAACCTATGTGAGGGACAAGCACTCACAACAGCCACTGTGTACCAGAATCCTATTTGATTGTCAAACACTTCAGACCCTAGTAGAGGAGTGTTCTGGAATCCCTATGTGAAGGACAAACTCTAAATAACCAGCATAGCAGTGCTCTGGAATCTTTGGGAGAGAAAGCATCAGACCCTAGCAGTGTTCTGGGATCCTATGTGAGGGAAAAACATTCCAGACCCGCATAGCAGTGTTTGGAATCTATACGAGTGACAAACACTCAGAACCCACCAGCAGTGTTCTGAATCTTTTTGTGAGGTAAAAACACTCAGACCCTCAAAGCAGTGTTCTGGAATCCTGCGTGATGGAAAAACATTCAGACGTAGCTGTGTTCTGGAATCCTATGTGAGGGAGAAACATTGTGACCCTCATGTAGCATTGTTCTGGAATCCAATATGAGGGACAAACACTCAGAAGCCAGCAGCTGTATTCTGGAATGCCATATTGAGAAAAGACTCCAGAACCCAACAGCAGTGTTCTGGAGATCTATCAAGGAAATAACCCTAGAGATTGGAGCACTGTACTGGAAGTCTTATATTAGGGACACATATTCAGACACTCGTAGAAGTGTTCTGGAATACTATGTGAAAGGACAAACACTAAGAAAACAGCAGCAGGGCTTTGGAATCCTTTGTGAGGACAAAAAAACAGAACCCATCAGCAGTGTTCTGAGAATCATTGTGAGAAAAATGTTTCTAGGTCCTATTAACAGTGTTCTGGAGATCCTATGTGAGGTAAACATTCAGATCCCTCATAGCAGTGGTCTGGAATCGTATGTGAGAGACAAACCCTCACAACCCAGCAGCAGTGTTCTGCAATCCCTATGTGAGCGACGAACATTGAGAACTTCGTAGCAGTGTTCTGATATTCTATGTAGAGCAAACACTCACAACCCGGCAGCACTGCTCTGGAATCGTATGTGAGGACAACAACAGAACCCAGCAGCCGTGTTCTGGAAACCTCGTGAGGGACAAAATCTCAGAGCTCAGCAGCAGTGTTCTGCAATCCTATGTGAGTGACAAATACTCAGAACCCAGCAGCAGTGTTCTGGAATCTTTGTGAGGACAAACACTAGAACCCAGCAGCAGTGTTCTAGAGTCCTTTGTGAGGACAAACATTCAGAAACTCTCTTCCAGTGTTCTGGAATCTTAGGTGAGGGACAAACACACTGAACCCAGCAGCTGTTTTGGAATCCCATGTGAGGCAGAAACACTCAGAACTCAGCAGTGTTCTGGAATCTATGTGAGTGAAAAACACTCAGGAGCCAACAGCAGTGTTCACAGAATCTTTGTGGGCAAACCTTCAAGACCCTAGAATCAGTGTTCTGGAATCCTATGTGATGAACAAACACTCAGAACCCAACAGCAGTGTTTTTGATTCCTTTGTTTTGGAGAAACATTCAGACCATTGTAGCACTGTTCCACTATTCTATGTGAGGGACAAACTCTCAGAACCCAGTAGCAGTGCTAAGTCCTATGTGAGGACAAACACTCAGAACCCAGCAGCAGGGTTCTGGAATCCTATGTGAGGGTCAAGCACTCAGAGGCAGCAGCAGTGTTCTGGAATCCCTATGTGAGGGCTTACTAAGAACCCAGTCACTGTGTGCTGGAATCCTATGTGGGAGAAACATTAGAGACAGTCACTGTGTGCTGGAATCCTATCTCAAGGACAAACATTCAGACCATTGTAGCACTGTTCCGCTATCCCTAGCGAGGGACAAACTCTCAGAACCCAGTAGCAGTGCTCTAGGAATCCTATGTGAGGACAGAAACACTGAACCCAGCAGCAGCAGGAATACTGGAATCCTATGTGAGGTCAAACACTCAGAAGGCAGCAGCAGTATTCTGGAATACATGGCAGGAGAAACATTCAGAACCCAGTGCTGTGTGCTGGAATCCTATGTGAGGGGAGAAACACTCACAACTCAGTCACTATGTGCTGGAATCCTATCTGAGGACAAACATTCAGACATGTAGAAGTGTCCTGGAATCCTATGAGGGACAAACACTGAGAACCCAGCAGCAGAGTTCTAGAATTCTTCGTGAAGACAAACATTCAGACACTCGAAGCAGTGTCCTAGAATCTATGTGAGGACAAACACTTCTAGAACCCAGCAGAATTGTTCTGGAATCCTTTGTGATGGATGAGCATTTGAGCCCTCGTGGCAGTGTTCTGGAAACCTAAGTGAGGGCAAACACTCAGTTGTAGCAGTGTTCTGGAATCCTATGTGACTGACAAACACTCAGAACCCTGAAGCAATGTTATGAAATCCTGTGTGAGTGCAAACACTCAGAACCCACCATCAATGCTCTGCAATCCTATGTGAGGAAAGAAACACTCAGAAACCTGCAGCAGTGTTCTGGAATCTATATATGGGTCAATAATTCAGACCATCATAGCACTGTTCTGGAATGCTCTGTGAGGACAAACATTCAGAAACTTGTAGCAGAGTTCTGGAATCTATGTGAGGGAGAAACCCTCAGAACCTAGCAGTAGTGTTCTGGAATCCTTATGTGAGATAACACTCAAGACCAGCCGCAGTGTTCTGGAATGCTATGTGAGGACAAACACTCAAAACCAAGCAGCAGGATTCTGTTATCTACCATGAGACAAACACTCGAACCCAGCAGAACTGTTATGGAATCTATGTGAGGACAAACACTCACAAACAAGCAGCTTTTGGAATCCCTATGTGAGGAGAAATCTTCAGAACCTAGCAGCAGTGTTCTGGAATCGTATGTGTGGACTTCAGCACACTCAGAACCCAGCAGCATGTTGAGAATGCTATGTGAGGGAGAAACACACAAAACCCACCAGCAGTGTTCTGGTTTAATATATGCGGGACAAACACACAGAACCCAGCAGAAGTGTTCTGTAATCCCATGTGAGGGTCAAACACTCACAAACCAGCAGCAATGTTTTGGAGTCTCTTTGTGAGGGACAAACATTAAACCTCAATAAAGTGCTCTGCAATCTATCAGCGAGGAACAACACTCTACAGGCCCAGCAGCAATGTTTTCGAATCCCATGAAAGGGACAAACACTCAGAACTTCGGCAGCATTTTCTGGAATCCTATGGTGACAAACTCTCAGAACACAGCAGCGGTGTTCTAGAATCACTGTAGGAGACAAACATTCAGAATGATCATAACAGTGTTCTGGTATCTCATGTGAGGACAAACACTCGGAAACCAGCAGCAGTGCTCTGAATTCTTGCAGGACAAACAAACCGAAGAGGTTCTGGAATTACTGTAAAGGACCAAGCACTGAGAACCCAGGAGCAGCGTTCTGGAATCCCATGTGAGGGACAAACGCTCAGAACCCAACAGCAGTGTTCTGTAATCTAATTGAGGACAGACACTCACAGCCCAGCATTGTTCTAGATTCGCTGTGAGGAACCAAGCATTTCAGACCCTCGGCAGTGTTCTGGAATGTTATGTGAGGGACAACCCTCTGAACCCAGCAGGGTTCTGGAATCAGTGAGTGACAAACACTCAAAACCCAGCAGCAGTGTTCCGGAATCCTTTGTGAGGACAAGCTTTCCAAACCTCGAAGCATTGTTATGGAGTCACCTTAGCAACGAGGAACACACTCAGAATCCCGCGCGCAGCGATATGATCTTGTGATGGACAAACATCCAGACACTCTTAGCAGTGTTCTGGAACGCTATGTGATGATTGTAAACCTACAGGCCAGGCAGTGTTCTGGAATCCTCTGTGAGGACAAACACTCAGAACCCAGTAGTAGTGTTCTGGAATCTAATGCATGAGGACAAACACACTAAGAACCCAAGGAGCAGTGTTCTGCAATCTATGAGGGACAAACACTACAGCCCACCAGCATGGCAGTGTTCTAGAATCCTTTGTGAGGAAAAACATTCAGACCATCGAATCAGTGTTCTGGAATCTATATGTGGGGAGACAAACGCTCAGAACCCAGCAGCAGTTTTCTGATCCTTTTCAGACAGACAAACCTTTAGACGATCTTAGCAGTGTTCTGTTATCTATGTAAGGGACAAACACTCAGAACCCAGCAGCAGTGCTCTGGATTCCTTTGTGGGGACGAGCACTTAGAACCCAGGAGCAGTGTTCTGGAATCCTATGTGAGGACAAACACTCAGAATCCAGCAGCAGTGTTCTGGAATCTTAGAGTGAGGACAGACACTCACAACCCAGCAGCAGTGTTCTAGAATCCTTTGTGAGGGACAAACAGCATCAGACCACAGAAGCAGTGTTTCTGGAATCTATGTGAGAGCAAACACTCAGAGACACAGCATCAGTGTTTCACAGAATCCTATCTTGAGTGACAAACTAGAACCAGAACAGTATTCATCCATTGTAGAGGACAAACATTCTGTCTCAGCGAAGCATTTTTCTGGATTCCTATGCTGAGGGACACACTCAGAACCCAGCAGCAGTGTTCTGGAATCCTATGTGTGGGACAAACACTCAGAAACCAGCAGCAGTGTTCTGGAATCCTACCGTGAGGGACAAACACTCAGAACACAGCTACTCTGTACTGGGAATCTATCTGAGTATTGACAACATTCAGACTCTTGCAGAAGTGTTCTGGAATCCTATGTGATGGACAAACACTAACAAACTAGCAGCAGCGCTCTGGAATTCTTTGTGATACAGACGTGTTCAAGGAGCTCTTTAACAGTGTTCTGGAATCGTATGTGAGTACAAACACTCAAAACTCAGCAGCAGTGTTCTGGAATTCTATTTGAGGACAAACTCTCAGAACCCAGCAGCCATGCTGTGAAATGATATGTGGACAGACACTCAGAACCCAACAGCAGAGTTCTGGTATCTAAGTGAGGAACAAACACTCAGAACCCTGCAGAAGTATTCTGGAATCATGTGAGGGACAAACACTCAAAATCCAAGAAGGCAGTGTTCTGGAATCCTATGTGAGGACAAACACTCACACCCTCGAAGTGTTCTGGAATCTATGTGAAGGACAAACACTCAGAACCCAGTAGCAGTGTTCTGGAATCTGGTGTGAAGGACAAGCGTTCAGACTTGCTCGTAGCAGTGATATGGAGTTGCTGTAGAGACAAGCATTCCAGACACACTTATGTTCTGGAATCCTAAGTGAGAGAAACCCTCAAAAACAAGCTGCAGTGTTCTAGGAAATCTATGAAAGGACAATCCCTCAGTATCGAGGCAGTGTTTGGAATCCTATCTGAGGGACAAACACTCAGAACTCAGCAGCAGTGTTCTGGAATCCTGTGTGAAGGAGAAACACTAGAACCCAACAGCAGTGTTCTGATTCCCGAAGTGTGGGACAATCACTCAAAACCCAGCCACTGTGTTCTGGAATCCTATCTGAGGTCAATGTAGGAACCTCGAGGAAGAGTTCTGGAATCCTATGTGAGGGAAAACACTCTGAAACCAGCAGAAGTGTTCTGGAATCCTTTGTGAGGGACAAACACTGAGAAATCAGAGCCGTGTTCTGGCATCCTATGTAGCGACAAACACTCTGAACCCAGCAGCAGTGTTTTGAATCACGTGAGCGACAAACACTCAGAACCCAAAGCAGTGTTCTGGAATACTTTTTGAGGACAATCATTCAGAACCTTGTAGCTGTGTTTCTGGAATCATATGTGAGGGCCAGCGAACACTTTGAACCCAGCTGCAGTGTTTTTGATTCCCCTGTGAAGGGAAAAACACTCAGGGCAGCAGCAGTGTTCTAGAATCAGCGTAATGGGACTAACATTCAGACCCTCAACGGTAACTTTTGGTCTATGTGAGGGACAAACACTGAGAACCCAACTGCAGTATTCTGCAATCCTTTGTGACAGAGAAACACTCAGACCATCGTAGCAGTGTTCTGGCATCCTATGTGCAGGAAAAACACTCCAAGAAACCAGCATCAGTGCTCTGGATTCCTTTGTGAGGGACAAACAAACAGAACCAGCAGCAGAGTTCTGGAATCCTATGTTGAGGACAAACACTCCAGAACCCATCAGCAGTGGTCAGAAATAATTTGAGGACAAACATTCAGAACCTAGTAGCAGTGTTCTGGAATAGTATGTGAGGACAAACACTCTAGGCAAACTGGCAGTCTTTTGGAATCACACGTGAGGGACAAAAACTCCAGAACCAAGCAGCAATGTTCTGAATACCATGTGAGAGACAACACTCAGAGCCCAGCAGCAGTGTTCTGGAATCTTATTTGAGTGACAAACACTGAGCTTAGCAGCAGAGTATTTACAGAGTCCTTTATGAGAACAAACTTCAGACACGCAGTCTTAAGATCCTATGTGAGAGACAAACCCTCAGAACCTTGAAGCAATGTTCTGCAATCCTTTTTGTTGGACAAACATTCCAGACCCTCGTAGCAGTGTTCCAGAATCCTATGTGGCGAAGGAACAAACACTCAGAACCCAGCAGTAGTGTTCGGGAATCCTATGGGAGGGACAACCATTTCCAGATCCAGCAGCAGTGTTGTGTAGTCTGTGAGGACAAACACTTTCAGAACCCAGCAGCTGTGTTCTGAAACCTATGTGAGGAAAATCATGAACCCAGCGTGTTGTGTTCTGGAATCCTATCTGAGGGAGAAATATTCAAACACTGTAGAAGAGTTCTGGAATCCTATGTGAGGGAAAAACCCTCAGAAGCCAGCAGTGCTCTGGAATCCTTTGAGCAAACAAATCAGAACCCTAGAAGCAGTGTTCTTGGATCTTTCCAGCTAGGAAAAACAGCTTCAAGACCCTCATAATAGTATTTTGGAATCCTATCTGAGGGACAACACTCAGACCAGCAGCTGTGTTCTGGAATCCTATATTATTAAGATAAACACTTAGAACCCAGCACAATATTCTGGAATACTACGTGAGCGACAAACTTTCAGAAGTTTGTAGCAGTATTCTACAGAATTCTATGTGAGGGACAAACACACAAGGCCAACAACTTGATAAGTGGTTCCTAAGTGAGGACAAACATTCAGAACCCAGCAGCAGTGTTCTGGTATCCTATGTGAGGACAAACACTCAGAACCCAGCAGCAGTGTTCTACAGAAATCCCTTTGTGAAGAGAAAAATGGCAGACCCTGCGCAGTGTTCTACTGGAATCCTATGTGATAGAAAAGTTCATACCCTCATAGCAGTGTTCTGGGATCCTATATGAGGTTGGCTTACAGAACCCACCAGCAGCGCTCGGAAACCACACTCTCTAGTGTTCTTGAATCCCATGTGAGAGAAACCTTCATACCCTCGTAGCATTGTTCTGGAATCAATATGAGGACAAACACTCAGAACCAGCCCAACATTCTGGAACCTTTATTGAGGATAAACATTCAGACCGTCATAGCAGTGTGCTGGAATCCTATGTGAGGGACAAATGCTCGAACCCAGCAGCAGTGGACTGGAGTCCTATGTGAGGACAGTACTCTGAGCTTAGCAGCAGTGTTCTGGAATCCTCTGTGAGGGACAAACTTTCACAACTGGCAGTGTTCTGGAGGCTTGTGAGTACAAACATTCAGAACCCAGCAGTGTTCTGGAAGTCCTTTGTGAGAACATTGTTGGAACCTCATAGCAATGTTCAGGGAGTAGGCGTACGTAAGGGACAAACACTCAGGAACACAGCAGCAGTGTTCTGCAATCCCATATGGACAAACACTCGAACCCAGCTGCAATGTTCTGTAATCCCTGTTTGACGACAAAGGCTCAGAAACCAGCAGCACTGTTCAAGAATCCTTTTTTGTGTGACAAACATTCTGAACCTCTAAAAGCAGTGTTCTGGAATCCTACTGTGAGGACAAACACCACAATCCCTGCAGCAGTTTTCTGGAATCCTTTGTGATGGACAAACATATTCAGACCCTCGTAGCAGTTTTCAGAATCCTATGTGTGGGACAAACACTCAGAACACAGCAACAGTGGTCTAGAATCCTTTGTGTGGGACAAAGATTCAGAACCCAGCAGCAGTGTTCTGGAATCCTATCAGGTACAAACACTCAGAAACAGTACAGCTTGTACTTTTGGATTCCACTGTGTACTGGAATCCTATCTGAAGGAAAAACATTCCGAACTTCGTAGAAGTTTTGGAATCCTGTGTGACGGACAAACACTAGAAATCTGCAGCAGTGTTCTAGAATCCTTTCTGAGTGACAAACAAACAGAACCCAGGAGCAGTGTGCTGCTATCCTTTTGAGGAAAAACTTTCACATCCTTATAGCAGTGTTCTGAAACCTATGTGAGGAAAGAAATTCAGACCCTCGTAGCAGTGCTCTGGAATCCTATATGAGGACAAACACTCAGAACCCAGCAGCAGTCTTCTGGAATCCTTTGGAGGAAAAACATTCACACCCTCGTAAAAGTGTTCTGGAATCTGTGAAGGAAAACATTCAGACCCTCGTAGCATTGTTCTGGAATCTAATATGAGGACAAACAGTCAGAACCCAGTTGCAGTGTTCTGGAATACTATGTGAGTGACAACACTCAGAACCCAGGAACTGGGTTCTGGAATTGTCTGTGCGGGCCAGTCATTCAGAACCTCATTATGATATTTCTGAGTCTATGTGAGGGAAAAACACTGTGATCTCAGCAGCAGTGTTCTGGAATCTATGTGAGGGCGAAACCTCTGACCAGCAGTCGTGTTCTGGAATCCCATGTGAGACAAACACTGAGATCTAGCAGCCTGTTCTGAATCCTATGTGAGTACAAACTCTCAGAACCCAGCAGCAGTGTTATGGAGTCCTTTGTGAGAGACAAACATTCAGACCCTCGTAGCAGTGTTCTGGAATCTTGTGAGGCACAAACACTCACAGCAGTAGACCCTCGTAGGAGTGTTCTGGAATCTACGTAAGGGACAAACACTCAGAACTCAGTGATTATTTTCTTGAAAGCTAAGTGAGTACAAACACTCGAAACCAGCAGTGTTCTGGGAATCTTGGTGAGGACTAACACTCCAGAACCCAACAGCATGTTCTGGGAGTATATGTGAAACAAGAACTCAAGAACTCAAACAGTGTTCTGGAATCGTATGTGAGGAACAAGCAATCAGGGCCAGCAGCAGCAGCCATGGAATCCTATGTGAGGGACAAACACTCAAACCCAGCCACTGTGTTCTGGAAACCTATCTAGTGATGACAAACATTCAGACACTCGTGGAAGTGTTCTGGAATCCTCGTGAGAGGCGGCTCAGAAACCAGCATAGGTGTTCTGGAATCCTTTTTGTGGAGAAACAAACAGAACCCAGCAGCAGTCTTCTGGAATCTATGTGAGGGAAAATATTTAGAACCCCGTAGCAGTGAAATACCTGGAATTCTATGAGGACACAACACACAGGACCCAGCAGCAGTGTTCTGGAACCTTATGTGATGGACAAACACTGAGAACACAACAGCAGTGTTCTGAAATCACATGTCAGCAGAAAAACATTCAGAAATTCATAGCAGTGTTCTGGAATCCTTTGTGACAGACAACACTCAGACTGTCGTAGCAGTGTTCTGATTTCCCATGAGAACAAACACAGCTAACATGTCTCAAAATCTCATGGGATCTATGCAAGGAACAACACAAGAGCACCCACACTATGTTCTTAAATACTAAAGAAACAACTTATTCAAACACTGGCCAAAGTATTCTAGAATCTATGTGAGGATAAACACTCAGAAACCAGCAGCAGTATTCTGGAATCCTTTGTGAGGGAAAAACATTAGACTCACGCATTCTTTAAAAATCTCTGTGTGAGGGACAAACCGTCTGAACTGAGCAGCAGTGTTCTGCAATCACTCTTGAGAGACAAACACTCACAGACAGCAGCAGTGTTCTGAAATCTAAATGAGGAACAAACCCTCAGAGACAGCAGCAGTGTTCTGAGTCCTTGTGGGGTACAACATTCAGAACCTCGAAGCAGTGTTCTGGAATCTATTTGAGGACAAACTCACAGAACCCAGCAGCAGTATTCTGGAATCCCAAGTGAGGGACAAACACTCAGAAACCAGCAGCAGTGTGCTGGAATGCTTTGAGGACAACATTCAGACCTTCGAAGCAGTGTTCTGCAATCCTATGTGATTGACAACTCTCAGAACCTAGGAGCAATCTTCTGTAATCTGTTGTGATGGAGAAACATTCGGAACCTCTTCGCCAGTGTTCTGGAATCTAGGTGTGGGAGAAACACTCAGAATCCAGCAGCAATGTTGGAAGTCTCTGTGAGAAAACACTCAAGGCTCAGCAGCGTAGTGTTCTGGAATCCTATGTGACCAGACAAACACTCAGATCACTGCAGCAGGGGGTCTGAAATCCTATGTGAAGGATAAGCACTCAGAACCCAGGAGCAGCGTTCTGGAATCCTTTCTGAGGACAAACATTCAGAACCTCGTAACAGTGTTCTGGAATCTTATGTGAGGACAAACACTCAGAACCCAACTTGGCAGCATTGTTCTGGAATCTTAGATGTGGGACAAACACTCCAGAACCAGGCATTAACAGTTCTGGAGTCCCATGTGAGGACAAACACTCAGAACCCAACAGCAGTATTCTGGAATCCTATGTGAGTGACAAACACTCAGAATCCAGCAGCAGTGTTCTAGAATTCTTTGTGTGGGACAAGCTTCATGCCCTCAAAGCAGTACTCTGGAATCCTATGTGAGGGAGGAACAGTCACAACCCAGCAGCAGTGTTCAGGAATCCTTTGTGACTGGACAAACATTCAGACCGTCGGAGCAGTGTTCTGGAATCTAAGTGAGGACAAACTACTCAGAACCAAGCCACTGTGTTCTGGAATCCTTCTGAGGGACAAATATTCAGACACCGTGAGTGTTCTGGAATCTATGTGAGGACAAACACTCAGAAAACAGCAGCAGTGCTATGGAGACCTTTGTGAGGAGCAGCAAACACAGCCAGAGTTTTATTCTGTAACCTTTTTGAGAGAAAACATTCAGAACCCCGTAGCAGTGTTCTGGAATCTATGTAGGGGACAAACATTCAGAACCCAGCAGCCGTGTTTTGGAATCCTGAGTGAAGACAAAGATTCAGAACTTCATAGCACTGTTCTGGAATCCCAGCTGAGACAGAAACACTCAGAACCCAGCAGTGTTCTAGAATCTATGTGAAGACAAACCCTCAGAACCCAACAGCAGTGTTCTGGAATCCATGTGAGGGACAAACACTCAGTACCCAACCACTGTGTTCTGGAATCCTATATGAAAAGGGACAAACATTCAGACAATCGTAGAAGTGTTCTGGAATCCTATATGAGGACAACACTCAGAAACCACCAGCAGTGCTCTGGAATCTTTTGTGAGGACAAAAATCTGAACCCAGCAGCACTCATTATTCTCTAATCATTTTAGGGACAAACGTTCAGAACCTCGTAGGAGGTTCTTGAATCTAAGTGAGGATAAAGCCCAGGCAGCAGCAGTGTTCTGGAATCTGCGTGAGTGACAAACACTCCGAACCCCGCAGGAATGTTCTTGAATCCTTTGTGAGGGACAAACATTCAAACCCTCGAAGCTATGGTGCTATGGAATCTATACATGAGGTACAAACAGTCATAACCCAGCAGAAATCTTCTGGAATCCTTGTTATGGACAAACATTGAGCCCTTGTAGCAGTGTTACGATCTAATGGAGGCACAAACACTCAGAACCCAGCAGCAGTGTTCTGGAATCTTATGTGAGGGACAAACACTGCAATCCAGCAGAAGTGTTCTGGAATCCTATCTGAGGACATACACTCAGAACCCAGTAGCAGTATTCTGGAATTCTATGTGATGGTACACGCTCAGAAACCAACAGCTGTTTTCTGGAATCTTGTCCAGTGACAAATATTCAGACACTCGTGGAAGTGTTCTGGAATCCTATGTGAGGGATAAACACTCAGAAACTAGCAGCGGTGATCTGGAATCCTTTGTAGAGGCTCAACAGAACCCAGCAGCTGTGTTCTGGAATCTTTGTGAGGAAAAATATTTAGACCCTTGTAGCAGTGTTCTGGAATCTATGTGAGGGACAAACACTGATACAACCCAGCGGCAGTGTTCTGGACTCCTCTATGAAGTCAAACCCTCAGAACCCAGCAGCAGTTTTCTGAAATAAAATGTGAGCAACAAACATTCAGAATTTCGTAGCAGAGTTCTGGAATCCTAGCGAGTGACAAACACTCAGGGAAACCAGCAGCAGTGTTCTAGAATCCTTTCTGTGGGACAAACTTTCAGACGCTCAAAGCAGTGTTCTGGAATCCTATGTGATGGACAAACACTCCGATCCCATCAGCAATGTTCTGCAATCCTTTGTGATGGGCAAACATTCAGACCCTCGTAACAGATTTTGGAATCTAAGTGAGGGACAAACACTCCAGAACCCAGCAGCAAGCAGTGTTCTAGAATCCTATATGAAGAACAAACACTCACAACCCAGCAGCCAGTATTGCTAATCTGTTTGAGGGACAAACACTCCAGAACCCACTCACTGTGTACAGGAATCCTATCTACCATGGGCTAACACATTCAGACCCTCGTAGCAGTGTTCTGGAATCCTATGTGAGGAGAAACTCTAAAAAACCAACAGCAGTGCTCTGGAATCCTTTATGAGGGAAAACATTCAGACCTTTAGCAGTGTTCTGGAATCCTATGTGAGGGAAATATTTTCAGAGCCTCATAGCAATGTTTCTTAATCATATATGAGTGACAAACGCCAGAAACCAGCAGCAGTGTTCTGGAATCCCTTGAGAGGGAAAAACATTTACACCTTCATAACAGTGTTCTGGAATCCTTACTGTGGGAAAAATATTCAGACCCTCGTAACAGTGTTCTGGAATCCTATATGAGGGACAAACACTCAAAACCAGCAGCAGTGTTCTGGAATCTATAGCCAGAGAAGCGTACTCAGAGCTGTACAGTGTTCTGGAGTCTATGGAGTGACAAACTTTTGAAATTCGCTGGCAGTATTCTGGAATCTTATGTGAGGACAAACACACAGAACCCAGTAGCAGTGTTCTGGAATCTTATGTGAGTAACAAACACTCAGAATCCAGCAACAGTGTTCTGGAATCCTATGTGAGGACAAACACTCCAGAACTAGCAGCAGTGTTCTAGGAATACTTTGTGAGGAAAAACACTCAGAACACAGTAGTGTTCTGGTATCCACTATTATTATAGAATCCTATCTGAGACAAACATTCAGAACCTAATAGTAGAAATGTTGCAATTCTACGTGAGGGACAAATACTAAGAAATCTGCAGCAGTGCTCTGGAATCTATTGTGAAGGTCAAACAAATAGAACCCAGTAGCCTTGTTCTACAATACTTTATGAGGAAAAACTTTCAGACCCTCATGGTGGTCTGGAATCACACGTAGGAACAAACACTCAGAGACAGCAGCAGTGTTCTGTACTCCTTTGTGAGGACAACATTCAGTTCCTCAGAGCAGTATTTGGAATCCTATGCTTTGAATGACAAGCACTAAGAAACCATCAACAGTGTTCTGGAATCTATGCTGAATGACAAACCTAAGAAACCATCAGCAGTGTTCTGGAATCCTTTGTGAGTAGCTAAACATTCGACCCCCTTAGCAGGGTTCTGGAACTATGTGAGGACATTCAGACACTTAGCAGTGTTTTGGCGCCTTAGCAGTGTTTGGAAACCAATGTGAGGGCCAAACAGTCAGAACCCAGCATCAGTGTTCTGGAATACTTGGTAAGGGACAAGCATTCAGAAAATCTTATCAGTTTTCTGGAATCCCAACTGAGGAGAAACGCTCCAGAAAATATCTGCAGTGTTCTAGAATTCTATGTGAGGACAAACCCTCATTGCGAGCTGCAGTGTTCTGGATTCCCTAGGTGAGGGACAAACACTCCAGAACAAAGCAGCAGTGTTCACAGTCTCATAACGATGGACAAAAACTCAGAACCCAGCAGTGTTCTGATACCTATGGGAGGGACAAACACTCAGAACCCAGCCCCTGTGTTCTGGAATCCTATCTGAAGGACAAACATTCGGAGACTTGAAGAAGTTTTCTGGAATCTATGTGAAGGACAAACAGTCAGAAACCTGTAGCAATGTTCTGGAATCATTTGCAGGAACAAACACTCAAAACTCAAAAGCAGTATCCTGGAATCCTACGTGAGGCCCAAGCCTAAGAACCCAGCAGCAGTATTTTCGAATCCTTAATGAGTGACAAACAGTCCAGAAACTTGCAACATTATTTTAGGTTGCTGTCTCTAGTACAGAGTTCTGGCCAAGAACAAACGCCAGAACAACCACTGTATTTCACAGAATATTGCTCTGAGAAAAAATAGCCGAGCCTCGTAGAAATTATTTCACAGAATCCCTATGGTAACCAAATACTCGAAAACCGCTCAACAGTGCTCTGGAATCCTTTGTGATGGATAAATAAACAGAGCCCAGCAGCAGTGTTCTGGAATCCTTCGTGAGGACAAACATTCAGAACCTTGTAGCCGTGTTCTGGAATCGTATGTGAAGGGTCAAACACTTTGAACCAGCAGCTGTGTTCTGGAATCTCTATGTGAGGGACAGAAGCACTAGAACCCAGCAACAGTGTTCTGTAATCCTTACTAGTAGAGGACAAAGCACAAGAGCCTTAGCATTGTTCTGCAATCCTTTGTGTGGGGACAAAACACTCAGGCCCAGCAGCAGAGTTGAATCCCATGTGAGGGACAAACGTTCAGGCACTCAGAATAGTGTTTGGAATCCTATGTTAGGGACAAACACTCAGAAAACTGCAGCAGTGTTCTGGAATCACACGTGGGGATGTGACTGAATCCTGATAGCACTGTTGTGGAATGCTCTGTGAGGAACAAACAATCAGACCCTCATCAGCAGTGTTCACAATCCTATGTAAGTACAAACCCTCACAACTCAACTAACTTTCTGGAATTCTATGCGAGGACAAACTCAGAACCTAACAACTTGTTCTGGAATCATACGTAAGGTAATAACACTCAGAACCCTGCAGCAGTGTTCTGGAATGCTATGTAAGAGACAAACACAAAACAGAGCAGTAGTATTCTGGTATCCTATATGAGGTAAAAACACTCAGAGACAACAGAAGTGTTCTGAAATCTATGTCAGGCACAAACATTTAGAGCTCCCAGAAGTGTTCTGGAATATTATGTGAAGGACAAAAACTCAGAATCAGGTGCAGTATTCTGGAATCCTATGTGAGGGACAAACATTCAGACCCTCCTAGCAAGTGTTCTGGAATGCAATCTGTTGTAAAAACCCTCAGAACACAGAAGCAGTTGTCTGGAATCCTTTGTGATGAAGAAACTATTCCAGACCCTAGTAGCAGTGTTCTGGAATCTATGTGACGGACAAACCTTCAGAATCCAGCAATAGTGTACTGGAATCCTCTGTGAGGACATACACTCAGAACCCAGCAGTAGTGTTTTGGAATCCTTTGTGAGGACAAACCCTCAGAATCAGCAGTAGTGTTCTGGAATCCTCTGTGAGGGCCATACCCTCAGAACCAACCCGGTATTGTTCTGGAATCCTATGTCAGGAGGACAAACATTGAAACCAGCAGTTTTCTGGAATCCTATGTGAGGACAAACACTCAGAAACCAGCAGCAGTGTTCTACTGCAATCCCTATGTGAGGACAAACACTCTGGAAACCCAGCAGCAGTGTTCTAGAATCCTATGTGATGACAAACATTCAGAATTTTGTAGCAATGTTCTGCCATTCCATGTGAGTGACAAACACTCAGAAACCAGCAACAGCCTTCTAGAATCTATCGCAAGGAAAAACACTCAGAAGCCAGCAACAATGTTCTAGCATCCCTTGTGAGGGACAAACATTCAGAATCTCGTAGAAGTGCTCTGGAATCGCAAGTGAGGGAGAAACACACAGGCCCAGCAGCCCAATGTTTTGGAATCCTGTTTGAGCGACAAAGATACAGAACTCGTTGCAATGTTCTGGAATCCCATGTGAGGGACAAACACTGTGAGAATCCCAGCAGCAGTGTCTATGAGCTTATTACAGCTTACACATTTTTGTTACCCTTTTGCGCATTTTTATGTGCACACACACCAACCCACCCACCCACTTACACTATGTGAACAAACACTCAGAACCCAGCAGTGTTCTACAATCTATGTGAGGACAAACATTCAAGCTCATGTAGTGTTCTGCAATCCCTGTGTGAGGACAAACACTCAGAACCCAGCCACTGTGTTCTGGAATCTATCTGAGGACAAACATTCAGACACTTGGCAGAAGTGTTCACAGAATCCTATGAGGGTAAACACTCAGAAACAAGCAGCGGTGCTCTGGAGATGCCACAGAGGGACAAACAGAGCCCAGCAGTGTCCTGGAATCGAGGAAAATGGTGAGACCCTCGTCTCAGTTTTTACAATCCTATGTGAGGGAGAAACACTCAGAACTGGCAACAGTGTTCTAGAATCCATGTGAGAGACAAACACTGAGTTCTAGCAGCCCTGTTCTGGAATCCTATGTGAGTACAAACTCAGACACTCACGAAGCAGTGTTTGGGATCCCTATGTGAGGACCGGTCAGAACCTTGGCAGTCTTCTGATTCCCTAGAGTGGCTGTTCCGACCCTCGCTTGAGGATTCTGGAATCTATGTGAGGACAAACGCCAGAACCTACCCCTTAGTATTACAGAATCTTGAACAATACTCAAGGCGCGCAGGGTC',
  )
  expect(r1.get('cigar')).toEqual(r2.get('cigar'))
  expect(r1.get('cigar')).toBe(
    '48M4D36M1D97M5D14M1D5M1D37M2D44M1D5M1I11M2I3M2D6M2I8M1D45M3D43M1D4M2D41M1D58M1D31M2D7M1D31M5I3M1D24M2D1M1D19M1D8M1D16M2D25M1I11M1I14M2I7M1D10M2I1M1I4M1I8M1I8M1I18M2D7M1D8M1D64M2D38M1I17M2I13M1I32M2I16M1D11M1D6M1D5M3D41M1I20M1D6M1D47M1I72M4D50M1I71M1I5M3D8M1I25M1I2M1D5M1D4M1I20M1D3M2D10M1I57M1I49M1D34M1I12M2D6M1I5M1I24M1I14M2D11M1I71M1I55M1D48M1D9M2D30M1D100M1D46M1D24M1I49M2D39M3D17M1D41M1I6M1D10M3D8M1I161M2D3M1D12M1D62M1D23M1I12M5D1M2I37M2D12M1D3M1I1M2D68M1I4M1D39M1I13M1D4M2I7M2D14M2I2M1I2M1I16M1D40M1D3M1D25M1D24M1I48M1D17M2D23M2D89M1D8M1D11M2I84M1D14M2D2M2D75M1D49M1I37M1D56M1D38M1D47M1I9M2D2M1D8M1I3M2D30M1D38M1D3M1I16M1D25M1D8M1D28M4D6M1I9M1D47M1D5M3I1M1I26M1D149M1I20M2D7M1I3M1D14M1D4M2I20M2I49M1I9M1D17M3D40M1I1M2D20M1I33M1D39M4D18M2D3M1D2M1D11M2D3M1I8M1I83M1D8M1D18M3D18M1I1M2D9M1I6M1I12M2D29M1D13M3D18M3D53M1D38M2I6M3I6M2D17M1I12M1D1M1D3M2D56M3I1M1D11M2D5M2D24M1D44M2I3M1D6M2I13M1I20M3D19M1D3M3I4M2I26M1D39M1I11M1I32M2D2M1I48M1D54M1D49M1D42M1I5M1D59M2I18M1I9M1D8M1D15M1I14M1I3M1I11M1I14M3D4M1D3M1D11M4D9M1I2M1D18M1I26M1I6M2D86M1I39M1I14M3I95M2D6M2I5M2I3M1D3M1I27M1D47M1D45M3D38M1D48M2D26M1I4M1I24M1D20M1D2M2D13M1D73M2I23M1I1M2D3M1D13M1I12M4D18M2D35M1I10M1D23M2D7M1D77M1D83M1D4M1D3M1D41M1D64M1D25M1D31M1D8M2D27M1D27M1D29M1I22M3I45M1I14M2D23M2I1M3D2M1I22M1D3M1D4M2I5M1D120M2I52M1D42M1I31M2D3M1D47M1D59M1I22M1D18M1D57M2D14M1I3M2I16M1D6M1D6M2D14M2D71M1I35M4I59M1I30M3D5M1D10M2I23M1D13M1D9M2D1M1D7M2I2M1D44M1D46M3D21M2D3M3D6M1I11M1I24M2I4M1D9M2I3M1I40M1D10M2D28M2I83M2I25M2D4M1I9M1D5M2I4M1D11M1D47M1D35M3I3M1I12M1I6M1D10M1I1M3D8M3I23M2D41M2I1M4D26M1D15M4D23M2D37M1D8M1D16M1D4M2I5M3D18M1D59M1D35M1D4M1D61M2D1M2D12M1D5M1D5M1D18M3D16M1I11M5D5M2I23M1I5M3I23M1I32M3D12M1D25M1I9M1D40M1I28M2I23M1I4M1D56M2I19M1D110M2D25M2I4M1D5M3I63M2D27M1D82M1D33M1D13M1D47M1D43M1D3M1D39M3D8M1D44M1D115M3I6M1D1M1D4M1D4M1D47M1D17M1D6M2D28M2D17M1D7M1D8M1D13M1D88M2D20M8D6M80D26M1D31M1I4M1D20M1D12M1D5M3D12M1I5M1D8M1D11M1I15M1D31M1I8M1D2M1D38M1D14M1I62M3I3M1D41M1D10M1I39M1D38M1D11M1D26M3I1M1I12M2D3M1D5M1I92M1I93M3D8M5D8M4D12M39D2M1I6M1D13M1D8M1I6M2D22M3D6M1D3M2I30M1D8M1D59M1D3M2D4M1D4M3D6M3I4M1I69M2D1M1I23M1D24M1I1M2D15M1D6M1D11M1D33M1D8M1D88M2D5M1D4M1D114M1I14M1D41M2D13M2D2M1D19M2I24M1I27M1I69M1D47M1D20M5I39M1I17M1I19M1D104M1D86M1I39M1D8M1D8M1I56M1D4M1D2M1D12M1D8M1D49M1I11M1D68M1D55M1D67M3D17M1D8M1D38M1D55M3I49M1D46M1D26M4I11M1D35M1D10M1D8M1D4M1D9M3D21M1D82M1I1M2I12M1D4M2I45M1D20M1D20M2D2M1D68M1D35M1D49M1D138M1I7M5D37M1D38M1D23M2I123M1D18M2I163M1D5M1D20M1I67M1I5M1I2M2D3M1D20M1I34M3I5M1D3M2I41M1D50M1D16M2D56M1I4M1D24M1D145M1D25M1D4M1I19M5D5M2I14M1D4M1D15M1D9M1I26M1D95M1D11M1I5M1D17M1I31M3D24M1D2M2I16M2D17M3I12M2D111M1D22M3D18M1D19M1I1M2D29M1D30M1D12M3I42M1D5M1I12M1D40M1I11M1D24M2D8M1D13M2I14M1I1M1I10M1D113M1D11M1I36M1D15M1D22M1I21M1I21M1I10M1D23M3D16M1D96M1D53M1D59M1D50M1I29M2D3M18D8M1D11M2I2M8D2M3D8M1D5M2D10M1I4M1I9M1I6M1D9M1D18M2I4M1I6M1I6M3D4M1I16M1I76M1D46M1I40M1I14M1I2M1I4M1D30M2I1M1I2M1I2M1D7M1I3M1D7M1I3M3D23M1I5M1I10M1D16M3D43M1D67M3D3M1I6M1D56M1I10M2D1M1I10M1D22M2D25M1D7M2D16M1D76M2D55M1I1M2D20M1D23M1D50M1D55M1I74M1I4M1I3M1I27M1D56M1D47M1D17M1D50M1I28M2I11M2D5M3D26M1D31M3I7M1I9M1D14M2I33M1D86M1D119M1D9M2I41M1D40M2I7M1I13M1D2M1I3M4I3M73I6M3D18M3D17M1D8M1D12M2D8M1D15M1I9M1D38M1D8M1D20M1I12M1I10M2D4M1D35M1I2M1I2M2D20M3D18M6D1M1D7M1I1M2D22M1D32M1D21M1D23M1D32M1D7M2D10M2I12M1D6M1I10M4D17M2D10M1D6M3D2M1D6M2D2M1I30M1D8M1D10M1D11M46S',
  )
  expect(r1.id()).toEqual(r2.id())
})

test('pair across chrom', async () => {
  const ti = new BamFile({
    bamPath: require.resolve('./data/pair_across_chr.bam'),
  })
  await ti.getHeader()
  const ret1 = await ti.getRecordsForRange('1', 0, 272213638, {
    viewAsPairs: true,
    pairAcrossChr: true,
  })
  expect(ret1.length).toBe(2)
})

test('too few', async () => {
  const ti = new BamFile({
    bamPath: require.resolve('./data/too_few_reads_if_chunk_merging_on.bam'),
  })
  await ti.getHeader()
  const ret1 = await ti.getRecordsForRange('1', 10000, 10600)
  expect(ret1.length).toBe(34)
})

test('long read consistent IDs', async () => {
  const ti = new BamFile({
    bamPath: require.resolve('./data/CHM1_pacbio_clip2.bam'),
  })
  await ti.getHeader()
  const ret1 = await ti.getRecordsForRange('chr1', 110114999, 110117499)
  const ret2 = await ti.getRecordsForRange('chr1', 110117499, 110119999)
  const findfeat = k => k.get('name') === 'm131004_105332_42213_c100572142530000001823103304021442_s1_p0/103296'
  const [r1, r2] = [ret1, ret2].map(x => x.find(findfeat))
  expect(r1.id()).toEqual(r2.id())
})

test('long read consistent IDs chm1 pacbio', async () => {
  const ti = new BamFile({
    bamPath: require.resolve('./data/another_chm1_id_difference.bam'),
  })
  await ti.getHeader()
  const ret1 = await ti.getRecordsForRange('chr1', 116473849, 116473874)
  const ret2 = await ti.getRecordsForRange('chr1', 116473874, 116473899)
  const findfeat = k => k.get('name') === 'm131009_195631_42213_c100579462550000001823095604021430_s1_p0/145814'
  const [r1, r2] = [ret1, ret2].map(x => x.find(findfeat))
  expect(r1.id()).toEqual(r2.id())
})

xtest('large chunks', async () => {
  const ti = new csi({
    filehandle: new LocalFile(require.resolve('./data/out.marked.csi')),
  })

  await ti.parse()
  //index 16 == 'chr17'
  const ret1 = await ti.blocksForRange(16, 41248671, 41337570)
  expect(ret1[0].fetchedSize()).toBe(10893136)
})
