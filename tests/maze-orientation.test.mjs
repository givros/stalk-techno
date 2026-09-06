import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mazeDirectionLabel,
  mazeDirectionRotation,
  scratchDirectionToMaze,
} from '../lib/maze-orientation.ts';
import { MazeSimulation } from '../public/scratch/simulation.mjs';

const headings = [
  { direction: 0, label: 'nord', rotation: 0, row: 6, col: 6, delta: [-1, 0] },
  { direction: 1, label: 'est', rotation: 90, row: 6, col: 1, delta: [0, 1] },
  { direction: 2, label: 'sud', rotation: 180, row: 6, col: 6, delta: [1, 0] },
  {
    direction: 3,
    label: 'ouest',
    rotation: 270,
    row: 6,
    col: 6,
    delta: [0, -1],
  },
];

for (const heading of headings) {
  test(`the robot pointer and label match Scratch movement toward ${heading.label}`, () => {
    const maze = new MazeSimulation();
    Object.assign(maze.state, {
      row: heading.row,
      col: heading.col,
      direction: heading.direction,
    });
    const direction = scratchDirectionToMaze(maze.state.direction);
    assert.equal(mazeDirectionLabel[direction], heading.label);
    assert.equal(mazeDirectionRotation(direction), heading.rotation);
    assert.equal(maze.move(), null);
    assert.equal(maze.state.row, heading.row + heading.delta[0]);
    assert.equal(maze.state.col, heading.col + heading.delta[1]);
  });
}

test('the pointer stays aligned after left and right turns across north', () => {
  const maze = new MazeSimulation();
  maze.state.direction = 0;
  for (const turn of [-1, 1]) {
    for (let count = 0; count < 4; count++) {
      maze.turn(turn);
      const direction = scratchDirectionToMaze(maze.state.direction);
      assert.equal(mazeDirectionRotation(direction), maze.state.direction * 90);
    }
    assert.equal(
      mazeDirectionLabel[scratchDirectionToMaze(maze.state.direction)],
      'nord',
    );
  }
});
