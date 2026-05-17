import { describe, expect, it } from 'vitest'
import * as api from './index'
import { getStylePack as directGetStylePack } from './style/packs'

describe('index barrel runtime exports', () => {
  it('re-exports id branding constructors', () => {
    expect(typeof api.asNodeId).toBe('function')
    expect(api.asNodeId('x')).toBe('x')
  })

  it('re-exports style pack lookup function', () => {
    expect(api.getStylePack('minimal')).toBe(directGetStylePack('minimal'))
  })
})
