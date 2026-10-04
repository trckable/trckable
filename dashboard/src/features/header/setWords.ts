// A filter set in words, the same everywhere it is shown (the chips, the
// phone's sheet, a saved view's line): "Country is DE or AT", "Device is not Mobile".
import type { FilterSet } from '../../lib/filterSet'
import { rowCopy } from './rowCopy'

export function setWords(set: FilterSet, dimLabel: (dim: string) => string, valueLabel: (dim: string, value: string) => string) {
  return {
    dim: dimLabel(set.dim),
    op: set.op === 'not' ? rowCopy.isNot : rowCopy.is,
    not: set.op === 'not',
    value: set.values.map((v) => valueLabel(set.dim, v)).join(rowCopy.or),
  }
}
