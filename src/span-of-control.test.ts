import { describe, expect, it } from 'vitest'
import { asDeptId, asNodeId } from './types/branded'
import { defaultSpanOfControlOptions, spanOfControl } from './span-of-control'
import type { OrgNode, OrgTree } from './types/org-tree'

const nMgr = asNodeId('mgr')
const nEmp = asNodeId('emp')
const nVac = asNodeId('vac')
const nShadow = asNodeId('shadow')
const dUnit = asDeptId('unit')

const employeeNode = (id: ReturnType<typeof asNodeId>, title: string): OrgNode => ({
  kind: 'employee',
  id,
  meta: { title },
  children: [],
  staff: []
})

const vacancyNode = (id: ReturnType<typeof asNodeId>, title: string): OrgNode => ({
  kind: 'vacancy',
  id,
  meta: { title, vacant: true },
  children: []
})

const baselineTree = (root: OrgNode): OrgTree => ({
  root,
  dottedEdges: [],
  shadowNodes: [{ id: nShadow, primary: nEmp }]
})

describe('defaultSpanOfControlOptions', () => {
  it('keeps documented default inclusion and manual-fte settings', () => {
    expect(defaultSpanOfControlOptions.includeVacancies).toBe(true)
    expect(defaultSpanOfControlOptions.includeShadows).toBe(false)
    expect(defaultSpanOfControlOptions.useManualFte).toBe(true)
  })
})

describe('spanOfControl manual mode', () => {
  it('returns manual source when node has fte and manual override is enabled', () => {
    const manager: OrgNode = {
      kind: 'employee',
      id: nMgr,
      meta: { title: 'Manager', fte: 7 },
      children: [],
      staff: []
    }

    const result = spanOfControl(manager, baselineTree(manager))

    expect(result.source).toBe('manual')
    expect(result.span).toBe(7)
  })
})

describe('spanOfControl calculated defaults', () => {
  it('calculates direct reports with default vacancy/shadow policy', () => {
    const manager: OrgNode = {
      kind: 'employee',
      id: nMgr,
      meta: { title: 'Manager' },
      children: [
        employeeNode(nEmp, 'Direct report'),
        vacancyNode(nVac, 'Vacancy'),
        employeeNode(nShadow, 'Shared report'),
        {
          kind: 'department',
          id: dUnit,
          name: 'Unit',
          head: nEmp,
          members: []
        }
      ],
      staff: []
    }

    const result = spanOfControl(manager, baselineTree(manager))

    expect(result.source).toBe('calculated')
    expect(result.span).toBe(2)
  })
})

describe('spanOfControl policy overrides', () => {
  it('supports policy overrides for vacancies and shadows', () => {
    const manager: OrgNode = {
      kind: 'employee',
      id: nMgr,
      meta: { title: 'Manager' },
      children: [
        employeeNode(nEmp, 'Direct report'),
        vacancyNode(nVac, 'Vacancy'),
        employeeNode(nShadow, 'Shared report')
      ],
      staff: []
    }

    const result = spanOfControl(manager, baselineTree(manager), {
      includeVacancies: false,
      includeShadows: true,
      useManualFte: false
    })

    expect(result.source).toBe('calculated')
    expect(result.span).toBe(2)
  })
})
