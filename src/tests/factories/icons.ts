import type { IconBounds } from '../../icons/render'

/** Build typed icon bounds for render tests. */
export const mkIconBounds = (input: {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}): IconBounds => ({
  x: input.x,
  y: input.y,
  width: input.width,
  height: input.height
})
