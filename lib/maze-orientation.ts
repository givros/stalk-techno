export type MazeDirection = 0 | 1 | 2 | 3;

// Preserve the site's east-first convention used by its existing saved states.
export const mazeDirectionLabel: Record<MazeDirection, string> = {
  0: 'est',
  1: 'sud',
  2: 'ouest',
  3: 'nord',
};

export function mazeDirectionRotation(direction: MazeDirection): number {
  // Arrow artwork points up before rotation.
  return ((direction + 1) % 4) * 90;
}

export function scratchDirectionToMaze(
  direction: MazeDirection,
): MazeDirection {
  // Scratch's lab simulation is north-first: north, east, south, west.
  return ((direction + 3) % 4) as MazeDirection;
}
