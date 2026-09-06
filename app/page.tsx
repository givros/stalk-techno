'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bell,
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  CircleDot,
  DoorOpen,
  GitBranch,
  GripVertical,
  KeyRound,
  LockKeyhole,
  Play,
  RotateCcw,
  Trash2,
  TriangleAlert,
  X,
  Zap,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  mazeDirectionLabel as directionLabel,
  mazeDirectionRotation,
  scratchDirectionToMaze,
  type MazeDirection as Direction,
} from '@/lib/maze-orientation';
import {
  ScratchChallenge,
  type ScratchPanelProps,
} from '@/components/scratch-challenge';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';

type Screen =
  | 'access'
  | 'teacher'
  | 'challenge'
  | 'stage3'
  | 'stage4'
  | 'stage5';
type CommandKind = 'advance' | 'left' | 'right';
type ActionKind = CommandKind | 'none';
type ConditionKind =
  | 'wall-ahead'
  | 'clear-ahead'
  | 'on-item'
  | 'near-exit'
  | 'has-key';
type BlockKind = CommandKind | 'repeat' | 'if';
type CollectibleKind = 'key' | 'battery' | 'signal' | 'module';
type EnergyCategory = 'renewable' | 'nonrenewable';
type ElevatorAction =
  | 'open-doors'
  | 'close-doors'
  | 'choose-next'
  | 'move-up'
  | 'move-down';
type ElevatorActionKind = ElevatorAction | 'none';
type ElevatorCondition =
  | 'has-requests'
  | 'request-above'
  | 'request-below'
  | 'request-here'
  | 'doors-open';
type ElevatorBlockKind = ElevatorAction | 'repeat' | 'if';
type ElevatorMotion = 'idle' | 'up' | 'down';

type ElevatorInstruction = {
  id: string;
  kind: ElevatorBlockKind;
  count?: number;
  condition?: ElevatorCondition;
  thenAction?: ElevatorActionKind;
  elseAction?: ElevatorActionKind;
  children?: ElevatorInstruction[];
};

type ElevatorProgramStep =
  | { kind: 'command'; action: ElevatorAction }
  | {
      kind: 'if';
      condition: ElevatorCondition;
      thenAction: ElevatorActionKind;
      elseAction: ElevatorActionKind;
    };

type ElevatorRuntime = {
  floor: number;
  doorsOpen: boolean;
  target: number | null;
  requests: number[];
  served: number[];
  motion: ElevatorMotion;
};

type EnergySource = {
  id: string;
  name: string;
  category: EnergyCategory;
  tile: number;
};

type Instruction = {
  id: string;
  kind: BlockKind;
  count?: number;
  command?: CommandKind;
  condition?: ConditionKind;
  thenCommand?: ActionKind;
  elseCommand?: ActionKind;
};

type ProgramStep =
  | { kind: 'command'; command: CommandKind }
  | {
      kind: 'if';
      condition: ConditionKind;
      thenCommand: ActionKind;
      elseCommand: ActionKind;
    };

type MazeCell = {
  id: string;
  kind: 'path' | 'wall' | 'start' | 'item' | 'door';
  value?: CollectibleKind;
};

type RobotState = {
  row: number;
  col: number;
  direction: Direction;
  collected: string[];
  visited: string[];
  steps: number;
};

type Feedback = {
  tone: 'neutral' | 'success' | 'error';
  message: string;
};

type MazeVariant = {
  name: string;
  cells: MazeCell[];
  start: { row: number; col: number; direction: Direction };
  door: { row: number; col: number };
  targetOrder: CollectibleKind[];
  route: string[];
};

type MazeVariantSpec = {
  name: string;
  startDirection: Direction;
};

type BinaryVariantId = 'A' | 'B' | 'C';

type BinaryVariant = {
  id: BinaryVariantId;
  first: string[];
  second: string[];
  answer: string;
};

const GRID_SIZE = 13;
const MAX_BLOCKS = 40;
const MAZE_LAYOUT_VERSION = 'branch-key-v1';

// These are the eight access codes for the first lock. They intentionally
// stay in the client bundle because this is a local escape-game experience.
const VALID_ACCESS_CODES = [
  '1468',
  '2307',
  '3741',
  '5082',
  '6914',
  '7426',
  '8193',
  '9540',
];

const TEACHER_BYPASS_CODE = '0000';

const MAZE_VARIANT_SPEC: MazeVariantSpec = {
  name: 'Le choix de la clé',
  startDirection: 0,
};

const BINARY_VARIANTS: BinaryVariant[] = [
  {
    id: 'A',
    first: [
      '00000000',
      '01111110',
      '00011000',
      '00011000',
      '00011000',
      '00011000',
      '00011000',
      '00000000',
    ],
    second: [
      '00000000',
      '01111100',
      '01000010',
      '01000010',
      '01111100',
      '01000000',
      '01000000',
      '00000000',
    ],
    answer: '2016',
  },
  {
    id: 'B',
    first: [
      '00000000',
      '01000010',
      '01000010',
      '01111110',
      '01000010',
      '01000010',
      '01000010',
      '00000000',
    ],
    second: [
      '00000000',
      '01111110',
      '01000000',
      '01000000',
      '01111100',
      '01000000',
      '01000000',
      '00000000',
    ],
    answer: '0806',
  },
  {
    id: 'C',
    first: [
      '00000000',
      '00111110',
      '01000000',
      '01000000',
      '01000000',
      '01000000',
      '00111110',
      '00000000',
    ],
    second: [
      '00000000',
      '01000000',
      '01000000',
      '01000000',
      '01000000',
      '01000000',
      '01111110',
      '00000000',
    ],
    answer: '0312',
  },
];

const ENERGY_SOURCES: EnergySource[] = [
  {
    id: 'solar-panels',
    name: 'Panneaux solaires',
    category: 'renewable',
    tile: 0,
  },
  { id: 'coal', name: 'Charbon', category: 'nonrenewable', tile: 10 },
  { id: 'wind-turbine', name: 'Éolienne', category: 'renewable', tile: 1 },
  { id: 'oil-pumpjack', name: 'Pétrole', category: 'nonrenewable', tile: 11 },
  {
    id: 'hydroelectric-dam',
    name: 'Barrage hydroélectrique',
    category: 'renewable',
    tile: 2,
  },
  {
    id: 'natural-gas',
    name: 'Gaz naturel',
    category: 'nonrenewable',
    tile: 12,
  },
  {
    id: 'waterwheel',
    name: 'Roue hydraulique',
    category: 'renewable',
    tile: 3,
  },
  {
    id: 'uranium',
    name: 'Minerai d’uranium',
    category: 'nonrenewable',
    tile: 13,
  },
  { id: 'geothermal', name: 'Géothermie', category: 'renewable', tile: 4 },
  { id: 'peat', name: 'Tourbe', category: 'nonrenewable', tile: 14 },
  { id: 'biomass', name: 'Bois / biomasse', category: 'renewable', tile: 5 },
  {
    id: 'oil-shale',
    name: 'Schiste bitumineux',
    category: 'nonrenewable',
    tile: 15,
  },
  { id: 'tidal-turbine', name: 'Hydrolienne', category: 'renewable', tile: 6 },
  {
    id: 'tar-sands',
    name: 'Sables bitumineux',
    category: 'nonrenewable',
    tile: 16,
  },
  {
    id: 'wave-buoy',
    name: 'Bouée houlomotrice',
    category: 'renewable',
    tile: 7,
  },
  { id: 'propane', name: 'Propane', category: 'nonrenewable', tile: 17 },
  { id: 'biogas', name: 'Méthaniseur', category: 'renewable', tile: 8 },
  { id: 'diesel', name: 'Gazole', category: 'nonrenewable', tile: 18 },
  {
    id: 'solar-thermal',
    name: 'Capteur solaire thermique',
    category: 'renewable',
    tile: 9,
  },
  { id: 'lignite', name: 'Lignite', category: 'nonrenewable', tile: 19 },
];

function parseCellId(id: string) {
  const [row, col] = id.split('-').map(Number);
  return { row, col };
}

type GeneratedMaze = {
  openCells: Set<string>;
  route: string[];
  startId: string;
  doorId: string;
};

function createSimpleMaze(): GeneratedMaze {
  const openCells = new Set<string>();
  const addHorizontal = (row: number, fromCol: number, toCol: number) => {
    const start = Math.min(fromCol, toCol);
    const end = Math.max(fromCol, toCol);
    for (let col = start; col <= end; col += 1) {
      openCells.add(createCellId(row, col));
    }
  };

  const addVertical = (col: number, fromRow: number, toRow: number) => {
    const start = Math.min(fromRow, toRow);
    const end = Math.max(fromRow, toRow);
    for (let row = start; row <= end; row += 1) {
      openCells.add(createCellId(row, col));
    }
  };

  // One shared corridor splits into two clear branches: the key branch and
  // the locked-door branch. Every open cell belongs to this small puzzle.
  addHorizontal(6, 1, 6);
  addVertical(6, 2, 10);
  addHorizontal(2, 6, 10);
  addHorizontal(10, 6, 10);

  const startId = createCellId(6, 1);
  const doorId = createCellId(10, 10);
  return {
    openCells,
    route: Array.from(openCells),
    startId,
    doorId,
  };
}

function createMazeCells(
  generated: GeneratedMaze,
  items: Map<string, CollectibleKind>,
): MazeCell[] {
  const { startId, doorId } = generated;

  return Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => {
    const row = Math.floor(index / GRID_SIZE);
    const col = index % GRID_SIZE;
    const id = createCellId(row, col);

    if (id === startId) return { id, kind: 'start' };
    if (id === doorId) return { id, kind: 'door' };
    const collectible = items.get(id);
    if (collectible) return { id, kind: 'item', value: collectible };
    return { id, kind: generated.openCells.has(id) ? 'path' : 'wall' };
  });
}

const generatedMaze = createSimpleMaze();
const mazeItems = new Map<string, CollectibleKind>([
  [createCellId(2, 10), 'key'],
]);
const mazeStart = parseCellId(generatedMaze.startId);
const mazeDoor = parseCellId(generatedMaze.doorId);
const MAZE_VARIANT: MazeVariant = {
  name: MAZE_VARIANT_SPEC.name,
  cells: createMazeCells(generatedMaze, mazeItems),
  start: { ...mazeStart, direction: MAZE_VARIANT_SPEC.startDirection },
  door: mazeDoor,
  targetOrder: Array.from(mazeItems.values()),
  route: generatedMaze.route,
};

const INITIAL_FEEDBACK: Feedback = {
  tone: 'neutral',
  message: 'Ajoutez des blocs, puis lancez le programme.',
};

const INITIAL_BINARY_FEEDBACK: Feedback = {
  tone: 'neutral',
  message: 'Reconstituez les deux lettres, puis validez votre lecture.',
};

const INITIAL_ENERGY_FEEDBACK: Feedback = {
  tone: 'neutral',
  message: '',
};

const SESSION_STORAGE_KEY = 'stalk-techno-session-v2';

const commandLabel: Record<CommandKind, string> = {
  advance: 'AVANCER',
  left: 'TOURNER GAUCHE',
  right: 'TOURNER DROITE',
};

const actionLabel: Record<ActionKind, string> = {
  ...commandLabel,
  none: 'RIEN',
};

const conditionOptions: Array<{ value: ConditionKind; label: string }> = [
  { value: 'has-key', label: 'CLÉ RÉCUPÉRÉE' },
];

const collectibleLabel: Record<CollectibleKind, string> = {
  key: 'clé',
  battery: 'batterie',
  signal: 'balise',
  module: 'module',
};

const elevatorActionLabel: Record<ElevatorActionKind, string> = {
  'open-doors': 'OUVRIR LES PORTES',
  'close-doors': 'FERMER LES PORTES',
  'choose-next': 'CHOISIR LE PROCHAIN ARRÊT',
  'move-up': 'MONTER D’UN ÉTAGE',
  'move-down': 'DESCENDRE D’UN ÉTAGE',
  none: 'RIEN',
};

const elevatorConditionLabel: Record<ElevatorCondition, string> = {
  'has-requests': 'IL RESTE DES DEMANDES',
  'request-above': 'DEMANDE AU-DESSUS',
  'request-below': 'DEMANDE EN DESSOUS',
  'request-here': 'DEMANDE À CET ÉTAGE',
  'doors-open': 'PORTES OUVERTES',
};

const ELEVATOR_FLOORS = Array.from({ length: 8 }, (_, floor) => floor);
const INITIAL_ELEVATOR_FEEDBACK: Feedback = {
  tone: 'neutral',
  message: 'Appuyez sur des étages, puis lancez le programme.',
};

function isScreen(value: unknown): value is Screen {
  return (
    value === 'access' ||
    value === 'teacher' ||
    value === 'challenge' ||
    value === 'stage3' ||
    value === 'stage4' ||
    value === 'stage5'
  );
}

function isCommandKind(value: unknown): value is CommandKind {
  return value === 'advance' || value === 'left' || value === 'right';
}

function isBlockKind(value: unknown): value is BlockKind {
  return isCommandKind(value) || value === 'repeat' || value === 'if';
}

function isConditionKind(value: unknown): value is ConditionKind {
  return (
    value === 'wall-ahead' ||
    value === 'clear-ahead' ||
    value === 'on-item' ||
    value === 'near-exit' ||
    value === 'has-key'
  );
}

function isActionKind(value: unknown): value is ActionKind {
  return value === 'none' || isCommandKind(value);
}

function isBinaryVariantId(value: unknown): value is BinaryVariantId {
  return value === 'A' || value === 'B' || value === 'C';
}

function isEnergyCategory(value: unknown): value is EnergyCategory {
  return value === 'renewable' || value === 'nonrenewable';
}

function isElevatorAction(value: unknown): value is ElevatorAction {
  return (
    value === 'open-doors' ||
    value === 'close-doors' ||
    value === 'choose-next' ||
    value === 'move-up' ||
    value === 'move-down'
  );
}

function isElevatorActionKind(value: unknown): value is ElevatorActionKind {
  return value === 'none' || isElevatorAction(value);
}

function isElevatorBlockKind(value: unknown): value is ElevatorBlockKind {
  return value === 'repeat' || value === 'if' || isElevatorAction(value);
}

function isElevatorCondition(value: unknown): value is ElevatorCondition {
  return (
    value === 'has-requests' ||
    value === 'request-above' ||
    value === 'request-below' ||
    value === 'request-here' ||
    value === 'doors-open'
  );
}

function sanitizeElevatorFloors(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value.filter(
        (floor): floor is number =>
          typeof floor === 'number' &&
          Number.isInteger(floor) &&
          floor >= 0 &&
          floor <= 7,
      ),
    ),
  );
}

function sanitizeElevatorProgram(value: unknown): ElevatorInstruction[] {
  const parse = (entry: unknown, depth: number): ElevatorInstruction | null => {
    if (!entry || typeof entry !== 'object' || depth > 4) return null;
    const candidate = entry as Partial<ElevatorInstruction>;
    if (
      typeof candidate.id !== 'string' ||
      !isElevatorBlockKind(candidate.kind)
    )
      return null;

    if (candidate.kind === 'repeat') {
      const count =
        typeof candidate.count === 'number' && Number.isFinite(candidate.count)
          ? Math.min(24, Math.max(1, Math.round(candidate.count)))
          : 12;
      const children = Array.isArray(candidate.children)
        ? candidate.children.flatMap((child) => {
            const parsed = parse(child, depth + 1);
            return parsed ? [parsed] : [];
          })
        : [];
      return { id: candidate.id, kind: 'repeat', count, children };
    }

    if (candidate.kind === 'if') {
      return {
        id: candidate.id,
        kind: 'if',
        condition: isElevatorCondition(candidate.condition)
          ? candidate.condition
          : 'request-above',
        thenAction: isElevatorActionKind(candidate.thenAction)
          ? candidate.thenAction
          : 'move-up',
        elseAction: isElevatorActionKind(candidate.elseAction)
          ? candidate.elseAction
          : 'none',
      };
    }

    return { id: candidate.id, kind: candidate.kind };
  };

  return Array.isArray(value)
    ? value.flatMap((entry) => {
        const parsed = parse(entry, 0);
        return parsed ? [parsed] : [];
      })
    : [];
}

function makeElevatorInstruction(
  kind: ElevatorBlockKind,
  nextId: () => string,
): ElevatorInstruction {
  if (kind === 'repeat') {
    return { id: nextId(), kind, count: 12, children: [] };
  }

  if (kind === 'if') {
    return {
      id: nextId(),
      kind,
      condition: 'request-above',
      thenAction: 'move-up',
      elseAction: 'none',
    };
  }

  return { id: nextId(), kind };
}

function updateElevatorBlocks(
  blocks: ElevatorInstruction[],
  id: string,
  updater: (block: ElevatorInstruction) => ElevatorInstruction,
): ElevatorInstruction[] {
  return blocks.map((block) => {
    if (block.id === id) return updater(block);
    if (block.kind === 'repeat') {
      return {
        ...block,
        children: updateElevatorBlocks(block.children ?? [], id, updater),
      };
    }
    return block;
  });
}

function appendElevatorBlock(
  blocks: ElevatorInstruction[],
  loopId: string,
  child: ElevatorInstruction,
): { blocks: ElevatorInstruction[]; inserted: boolean } {
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block.id === loopId && block.kind === 'repeat') {
      const next = [...blocks];
      next[index] = { ...block, children: [...(block.children ?? []), child] };
      return { blocks: next, inserted: true };
    }

    if (block.kind === 'repeat') {
      const nested = appendElevatorBlock(block.children ?? [], loopId, child);
      if (nested.inserted) {
        const next = [...blocks];
        next[index] = { ...block, children: nested.blocks };
        return { blocks: next, inserted: true };
      }
    }
  }

  return { blocks, inserted: false };
}

function removeElevatorBlock(
  blocks: ElevatorInstruction[],
  id: string,
): { blocks: ElevatorInstruction[]; removed: boolean } {
  const directIndex = blocks.findIndex((block) => block.id === id);
  if (directIndex !== -1) {
    return {
      blocks: blocks.filter((_, index) => index !== directIndex),
      removed: true,
    };
  }

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block.kind !== 'repeat') continue;
    const nested = removeElevatorBlock(block.children ?? [], id);
    if (nested.removed) {
      const next = [...blocks];
      next[index] = { ...block, children: nested.blocks };
      return { blocks: next, removed: true };
    }
  }

  return { blocks, removed: false };
}

function moveElevatorBlock(
  blocks: ElevatorInstruction[],
  id: string,
  offset: -1 | 1,
): { blocks: ElevatorInstruction[]; moved: boolean } {
  const directIndex = blocks.findIndex((block) => block.id === id);
  if (directIndex !== -1) {
    const nextIndex = directIndex + offset;
    if (nextIndex < 0 || nextIndex >= blocks.length)
      return { blocks, moved: false };
    const next = [...blocks];
    [next[directIndex], next[nextIndex]] = [next[nextIndex], next[directIndex]];
    return { blocks: next, moved: true };
  }

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block.kind !== 'repeat') continue;
    const nested = moveElevatorBlock(block.children ?? [], id, offset);
    if (nested.moved) {
      const next = [...blocks];
      next[index] = { ...block, children: nested.blocks };
      return { blocks: next, moved: true };
    }
  }

  return { blocks, moved: false };
}

function expandElevatorProgram(
  program: ElevatorInstruction[],
): ElevatorProgramStep[] {
  const steps: ElevatorProgramStep[] = [];
  const append = (blocks: ElevatorInstruction[]) => {
    blocks.forEach((block) => {
      if (block.kind === 'repeat') {
        const count = Math.min(24, Math.max(1, block.count ?? 12));
        for (let index = 0; index < count; index += 1)
          append(block.children ?? []);
        return;
      }

      if (block.kind === 'if') {
        steps.push({
          kind: 'if',
          condition: block.condition ?? 'request-above',
          thenAction: block.thenAction ?? 'move-up',
          elseAction: block.elseAction ?? 'none',
        });
        return;
      }

      steps.push({ kind: 'command', action: block.kind });
    });
  };

  append(program);
  return steps;
}

function evaluateElevatorCondition(
  runtime: ElevatorRuntime,
  condition: ElevatorCondition,
) {
  if (condition === 'has-requests') return runtime.requests.length > 0;
  if (condition === 'request-above') {
    return runtime.requests.some((floor) => floor > runtime.floor);
  }
  if (condition === 'request-below') {
    return runtime.requests.some((floor) => floor < runtime.floor);
  }
  if (condition === 'request-here')
    return runtime.requests.includes(runtime.floor);
  return runtime.doorsOpen;
}

function chooseElevatorTarget(runtime: ElevatorRuntime) {
  const above = runtime.requests
    .filter((floor) => floor > runtime.floor)
    .sort((a, b) => a - b);
  const below = runtime.requests
    .filter((floor) => floor < runtime.floor)
    .sort((a, b) => b - a);

  if (runtime.motion === 'up' && above.length > 0) return above[0];
  if (runtime.motion === 'down' && below.length > 0) return below[0];
  if (above.length > 0) return above[0];
  if (below.length > 0) return below[0];
  return null;
}

function sanitizeEnergyAssignments(
  value: unknown,
): Record<string, EnergyCategory> {
  if (!value || typeof value !== 'object') return {};

  const candidate = value as Record<string, unknown>;
  return ENERGY_SOURCES.reduce<Record<string, EnergyCategory>>(
    (assignments, source) => {
      const category = candidate[source.id];
      if (isEnergyCategory(category)) {
        assignments[source.id] = category;
      }
      return assignments;
    },
    {},
  );
}

function sanitizeProgram(value: unknown): Instruction[] {
  if (!Array.isArray(value)) return [];

  const sanitized: Instruction[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const candidate = entry as Partial<Instruction>;
    if (typeof candidate.id !== 'string' || !isBlockKind(candidate.kind))
      continue;

    if (candidate.kind === 'repeat') {
      const count =
        typeof candidate.count === 'number' && Number.isFinite(candidate.count)
          ? Math.min(9, Math.max(1, Math.round(candidate.count)))
          : 2;
      sanitized.push({
        id: candidate.id,
        kind: 'repeat',
        count,
        command: isCommandKind(candidate.command)
          ? candidate.command
          : 'advance',
      });
      continue;
    }

    if (candidate.kind === 'if') {
      sanitized.push({
        id: candidate.id,
        kind: 'if',
        condition: isConditionKind(candidate.condition)
          ? candidate.condition
          : 'has-key',
        thenCommand: isActionKind(candidate.thenCommand)
          ? candidate.thenCommand
          : 'advance',
        elseCommand: isActionKind(candidate.elseCommand)
          ? candidate.elseCommand
          : 'none',
      });
      continue;
    }

    sanitized.push({ id: candidate.id, kind: candidate.kind });
  }

  return sanitized.slice(0, MAX_BLOCKS);
}

function sanitizeRobot(value: unknown, maze: MazeVariant): RobotState {
  if (!value || typeof value !== 'object') return createInitialRobot(maze);
  const candidate = value as Partial<RobotState>;
  const rawRow =
    typeof candidate.row === 'number' ? Math.round(candidate.row) : 0;
  const rawCol =
    typeof candidate.col === 'number' ? Math.round(candidate.col) : 0;
  const row = Math.min(GRID_SIZE - 1, Math.max(0, rawRow));
  const col = Math.min(GRID_SIZE - 1, Math.max(0, rawCol));
  const safePosition =
    getCell(maze, row, col).kind === 'wall' ? maze.start : { row, col };
  const direction: Direction = [0, 1, 2, 3].includes(
    candidate.direction as number,
  )
    ? (candidate.direction as Direction)
    : maze.start.direction;
  const validVisited = Array.isArray(candidate.visited)
    ? candidate.visited.filter(
        (cellId): cellId is string =>
          typeof cellId === 'string' &&
          maze.cells.some((cell) => cell.id === cellId && cell.kind !== 'wall'),
      )
    : [];
  const visited = Array.from(
    new Set([
      createCellId(maze.start.row, maze.start.col),
      ...validVisited,
      createCellId(safePosition.row, safePosition.col),
    ]),
  );
  const collected = Array.isArray(candidate.collected)
    ? candidate.collected.filter(
        (item): item is CollectibleKind =>
          typeof item === 'string' &&
          maze.targetOrder.includes(item as CollectibleKind),
      )
    : [];

  return {
    row: safePosition.row,
    col: safePosition.col,
    direction,
    collected: Array.from(new Set(collected)).slice(0, maze.targetOrder.length),
    visited,
    steps:
      typeof candidate.steps === 'number' && Number.isFinite(candidate.steps)
        ? Math.max(0, Math.round(candidate.steps))
        : 0,
  };
}

function createCellId(row: number, col: number) {
  return `${row}-${col}`;
}

function getCell(maze: MazeVariant, row: number, col: number) {
  return maze.cells[row * GRID_SIZE + col];
}

function createInitialRobot(maze: MazeVariant): RobotState {
  return {
    row: maze.start.row,
    col: maze.start.col,
    direction: maze.start.direction,
    collected: [],
    visited: [createCellId(maze.start.row, maze.start.col)],
    steps: 0,
  };
}

const INITIAL_ROBOT = createInitialRobot(MAZE_VARIANT);

function makeProgramStep(block: Instruction): ProgramStep {
  if (block.kind === 'if') {
    return {
      kind: 'if',
      condition: block.condition ?? 'has-key',
      thenCommand: block.thenCommand ?? 'advance',
      elseCommand: block.elseCommand ?? 'none',
    };
  }

  return {
    kind: 'command',
    command:
      block.kind === 'repeat' ? (block.command ?? 'advance') : block.kind,
  };
}

function expandProgram(program: Instruction[]): ProgramStep[] {
  const steps: ProgramStep[] = [];

  program.forEach((block) => {
    if (block.kind === 'repeat') {
      const count = Math.min(9, Math.max(1, block.count ?? 2));
      const repeatedCommand = block.command ?? 'advance';
      for (let index = 0; index < count; index += 1) {
        steps.push({ kind: 'command', command: repeatedCommand });
      }
      return;
    }

    steps.push(makeProgramStep(block));
  });

  return steps;
}

function getDirectionDelta(direction: Direction) {
  return [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ][direction];
}

function isWallAhead(robot: RobotState, maze: MazeVariant) {
  const [rowDelta, colDelta] = getDirectionDelta(robot.direction);
  const nextRow = robot.row + rowDelta;
  const nextCol = robot.col + colDelta;

  return (
    nextRow < 0 ||
    nextRow >= GRID_SIZE ||
    nextCol < 0 ||
    nextCol >= GRID_SIZE ||
    getCell(maze, nextRow, nextCol).kind === 'wall'
  );
}

function evaluateCondition(
  robot: RobotState,
  maze: MazeVariant,
  condition: ConditionKind,
) {
  if (condition === 'wall-ahead') return isWallAhead(robot, maze);
  if (condition === 'clear-ahead') return !isWallAhead(robot, maze);
  if (condition === 'on-item')
    return getCell(maze, robot.row, robot.col).kind === 'item';
  if (condition === 'has-key') return robot.collected.includes('key');
  return robot.row === maze.door.row && robot.col === maze.door.col;
}

function InstructionIcon({ kind }: { kind: BlockKind }) {
  if (kind === 'advance') return <ArrowUp aria-hidden="true" />;
  if (kind === 'left') return <ArrowLeft aria-hidden="true" />;
  if (kind === 'right') return <ArrowRight aria-hidden="true" />;
  if (kind === 'if') return <GitBranch aria-hidden="true" />;
  return <RotateCcw aria-hidden="true" />;
}

function CollectibleIcon({ kind }: { kind: CollectibleKind }) {
  if (kind === 'key') return <KeyRound aria-hidden="true" />;
  if (kind === 'battery') return <Zap aria-hidden="true" />;
  if (kind === 'signal') return <CircleDot aria-hidden="true" />;
  return <LockKeyhole aria-hidden="true" />;
}

function makeInstruction(kind: BlockKind, nextId: () => string): Instruction {
  if (kind === 'repeat') {
    return {
      id: nextId(),
      kind,
      count: 2,
      command: 'advance',
    };
  }

  if (kind === 'if') {
    return {
      id: nextId(),
      kind,
      condition: 'has-key',
      thenCommand: 'advance',
      elseCommand: 'none',
    };
  }

  return { id: nextId(), kind };
}

function cellDescription(cell: MazeCell) {
  if (cell.kind === 'wall') return 'Mur infranchissable';
  if (cell.kind === 'start') return 'Position de départ';
  if (cell.kind === 'door') return 'Sortie';
  if (cell.kind === 'item' && cell.value) {
    return `Objet à récupérer : ${collectibleLabel[cell.value]}`;
  }
  return 'Case libre';
}

function AccessScreen({
  accessCode,
  accessError,
  onChange,
  onSubmit,
}: {
  accessCode: string;
  accessError: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <section className="access-layout" aria-labelledby="access-title">
      <div className="access-copy">
        <h1 id="access-title">
          Entrez dans
          <span> le labo.</span>
        </h1>
      </div>

      <div className="access-card terminal-panel">
        <div className="lock-emblem" aria-hidden="true">
          <LockKeyhole />
        </div>
        <h2>Quel est votre code ?</h2>
        <p className="card-help">Saisissez les quatre chiffres du cadenas.</p>

        <form
          className="access-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <InputOTP
            maxLength={4}
            value={accessCode}
            onChange={onChange}
            inputMode="numeric"
            aria-label="Code d'accès à quatre chiffres"
          >
            <InputOTPGroup className="access-otp-group">
              <InputOTPSlot index={0} className="access-otp-slot" />
              <InputOTPSlot index={1} className="access-otp-slot" />
              <InputOTPSlot index={2} className="access-otp-slot" />
              <InputOTPSlot index={3} className="access-otp-slot" />
            </InputOTPGroup>
          </InputOTP>

          <Button type="submit" size="lg" className="access-submit">
            OUVRIR L’ACCÈS
            <ArrowRight aria-hidden="true" />
          </Button>
        </form>

        <output
          className={`access-feedback ${accessError ? 'is-error' : ''}`}
          aria-live="polite"
        >
          {accessError ? (
            <TriangleAlert aria-hidden="true" />
          ) : (
            <KeyRound aria-hidden="true" />
          )}
          <span>{accessError || 'Code attendu : 4 chiffres'}</span>
        </output>
      </div>
    </section>
  );
}

function TeacherBypassScreen({
  onSelectStage,
}: {
  onSelectStage: (stage: Exclude<Screen, 'access' | 'teacher'>) => void;
}) {
  return (
    <section className="teacher-layout" aria-label="Mode professeur">
      <div className="teacher-panel terminal-panel">
        <h2>Mode professeur</h2>
        <div className="teacher-actions">
          <Button
            type="button"
            size="lg"
            onClick={() => onSelectStage('challenge')}
          >
            ÉPREUVE 2
            <ArrowRight aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="lg"
            onClick={() => onSelectStage('stage3')}
          >
            ÉPREUVE 3
            <ArrowRight aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="lg"
            onClick={() => onSelectStage('stage4')}
          >
            ÉPREUVE 4
            <ArrowRight aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="lg"
            onClick={() => onSelectStage('stage5')}
          >
            ÉPREUVE 5
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>
      </div>
    </section>
  );
}

function MazePanel({
  maze,
  robot,
}: {
  maze: MazeVariant;
  robot: Pick<RobotState, 'row' | 'col' | 'direction' | 'collected'> & {
    visited?: string[];
  };
}) {
  const facingRotation = mazeDirectionRotation(robot.direction);
  const facingLabel = directionLabel[robot.direction];

  return (
    <section className="terminal-panel maze-panel" aria-labelledby="maze-title">
      <div className="maze-heading">
        <div>
          <h2 id="maze-title">{maze.name}</h2>
        </div>
        <div className="direction-readout" aria-live="polite">
          <ArrowUp
            aria-hidden="true"
            strokeWidth={3}
            style={{ transform: `rotate(${facingRotation}deg)` }}
          />
          <span>{facingLabel}</span>
        </div>
      </div>

      <p className="mission-strip">
        Avec un SI, ramassez la clé lorsque le robot est sur sa case, puis
        atteignez la porte.
      </p>

      <div className="maze-frame">
        <div className="maze-grid" aria-label="Grille du mini-labyrinthe">
          {maze.cells.map((cell) => {
            const [rowText, colText] = cell.id.split('-');
            const row = Number(rowText);
            const col = Number(colText);
            const isRobot = robot.row === row && robot.col === col;
            const isVisited = robot.visited?.includes(cell.id);
            const isCollected =
              cell.kind === 'item' &&
              Boolean(cell.value && robot.collected.includes(cell.value));

            return (
              <div
                key={cell.id}
                className={`maze-cell tile-${cell.kind} ${
                  isVisited ? 'is-visited' : ''
                } ${isRobot ? 'is-robot' : ''}`}
                aria-label={cellDescription(cell)}
              >
                {isVisited && cell.kind !== 'wall' && (
                  <span className="trail-mark" aria-hidden="true" />
                )}
                {cell.kind === 'wall' && (
                  <span className="wall-mark" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                )}
                {cell.kind === 'item' && cell.value && (
                  <span
                    className={`item-mark ${isCollected ? 'is-collected' : ''}`}
                  >
                    {isCollected ? (
                      <Check aria-hidden="true" />
                    ) : (
                      <CollectibleIcon kind={cell.value} />
                    )}
                  </span>
                )}
                {cell.kind === 'door' && <DoorOpen aria-hidden="true" />}
                {cell.kind === 'start' && (
                  <span className="start-mark" aria-hidden="true">
                    START
                  </span>
                )}
                {isRobot && (
                  <figure
                    className="robot-marker"
                    title={`Robot, direction ${facingLabel}`}
                  >
                    <Bot aria-hidden="true" />
                    <span
                      className="robot-heading"
                      aria-hidden="true"
                      style={{ transform: `rotate(${facingRotation}deg)` }}
                    />
                    <figcaption className="sr-only">
                      Robot, direction {facingLabel}
                    </figcaption>
                  </figure>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="maze-footer">
        <div className="legend" aria-label="Légende">
          <span>
            <i className="legend-swatch legend-wall" /> mur
          </span>
          <span>
            <i className="legend-swatch legend-item" /> clé
          </span>
          <span>
            <i className="legend-swatch legend-door" /> sortie
          </span>
        </div>
      </div>
    </section>
  );
}

function PaletteBlock({
  kind,
  onAdd,
  onDragStart,
  disabled,
}: {
  kind: BlockKind;
  onAdd: (kind: BlockKind) => void;
  onDragStart: (
    event: React.DragEvent<HTMLButtonElement>,
    kind: BlockKind,
  ) => void;
  disabled: boolean;
}) {
  const label =
    kind === 'repeat' ? 'RÉPÉTER' : kind === 'if' ? 'SI' : commandLabel[kind];

  return (
    <button
      type="button"
      className={`palette-block palette-${kind}`}
      draggable={!disabled}
      disabled={disabled}
      onClick={() => onAdd(kind)}
      onDragStart={(event) => onDragStart(event, kind)}
      aria-label={`Ajouter le bloc ${label}`}
    >
      <span className="palette-icon">
        <InstructionIcon kind={kind} />
      </span>
      <span>{label}</span>
      <span className="palette-add" aria-hidden="true">
        +
      </span>
    </button>
  );
}

function ProgramBlock({
  block,
  index,
  total,
  onChange,
  onDelete,
  onMove,
  onDragStart,
  disabled,
}: {
  block: Instruction;
  index: number;
  total: number;
  onChange: (id: string, patch: Partial<Instruction>) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, offset: -1 | 1) => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>, id: string) => void;
  disabled: boolean;
}) {
  return (
    <div
      className={`program-block program-${block.kind}`}
      draggable={!disabled}
      onDragStart={(event) => onDragStart(event, block.id)}
    >
      <span className="drag-handle" aria-hidden="true">
        <GripVertical />
      </span>
      <span className="block-icon" aria-hidden="true">
        <InstructionIcon kind={block.kind} />
      </span>

      {block.kind === 'repeat' ? (
        <div className="repeat-content">
          <span className="block-label">RÉPÉTER</span>
          <input
            className="repeat-count"
            type="number"
            min={1}
            max={9}
            value={block.count ?? 2}
            onChange={(event) =>
              onChange(block.id, {
                count: Math.min(
                  9,
                  Math.max(1, Number(event.target.value) || 1),
                ),
              })
            }
            aria-label="Nombre de répétitions"
            disabled={disabled}
          />
          <span className="block-label">FOIS</span>
          <span className="repeat-bracket" aria-hidden="true">
            <ChevronDown />
          </span>
          <select
            className="repeat-command"
            value={block.command ?? 'advance'}
            onChange={(event) =>
              onChange(block.id, { command: event.target.value as CommandKind })
            }
            aria-label="Instruction à répéter"
            disabled={disabled}
          >
            <option value="advance">AVANCER</option>
            <option value="left">TOURNER GAUCHE</option>
            <option value="right">TOURNER DROITE</option>
          </select>
        </div>
      ) : block.kind === 'if' ? (
        <div className="if-block-shell">
          <div className="if-header">
            <span className="block-label">SI</span>
            <select
              className="if-condition"
              value={block.condition ?? 'has-key'}
              onChange={(event) =>
                onChange(block.id, {
                  condition: event.target.value as ConditionKind,
                })
              }
              aria-label="Condition du bloc SI"
              disabled={disabled}
            >
              {conditionOptions.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="if-body">
            <div className="if-body-row">
              <span className="if-label">ALORS</span>
              <select
                className="if-action"
                value={block.thenCommand ?? 'advance'}
                onChange={(event) =>
                  onChange(block.id, {
                    thenCommand: event.target.value as ActionKind,
                  })
                }
                aria-label="Action si la condition est vraie"
                disabled={disabled}
              >
                {Object.entries(actionLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="if-body-row">
              <span className="if-label">SINON</span>
              <select
                className="if-action"
                value={block.elseCommand ?? 'none'}
                onChange={(event) =>
                  onChange(block.id, {
                    elseCommand: event.target.value as ActionKind,
                  })
                }
                aria-label="Action si la condition est fausse"
                disabled={disabled}
              >
                {Object.entries(actionLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      ) : (
        <span className="block-label">{commandLabel[block.kind]}</span>
      )}

      <fieldset className="block-controls" aria-label="Déplacer le bloc">
        <button
          type="button"
          className="move-block"
          onClick={() => onMove(block.id, -1)}
          disabled={disabled || index === 0}
          aria-label="Monter le bloc"
          title="Monter le bloc"
        >
          <ChevronUp aria-hidden="true" />
        </button>
        <button
          type="button"
          className="move-block"
          onClick={() => onMove(block.id, 1)}
          disabled={disabled || index === total - 1}
          aria-label="Descendre le bloc"
          title="Descendre le bloc"
        >
          <ChevronDown aria-hidden="true" />
        </button>
      </fieldset>

      <button
        type="button"
        className="delete-block"
        onClick={() => onDelete(block.id)}
        disabled={disabled}
        aria-label="Supprimer ce bloc"
      >
        <Trash2 aria-hidden="true" />
      </button>
    </div>
  );
}

function ProgramPanel({
  program,
  feedback,
  isRunning,
  onAdd,
  onChange,
  onDelete,
  onMove,
  onDrop,
  onDragStart,
  onExecute,
  onReset,
}: {
  program: Instruction[];
  feedback: Feedback;
  isRunning: boolean;
  onAdd: (kind: BlockKind) => void;
  onChange: (id: string, patch: Partial<Instruction>) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, offset: -1 | 1) => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>, index: number) => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>, id: string) => void;
  onExecute: () => void;
  onReset: () => void;
}) {
  const allowDrop = (event: React.DragEvent<HTMLDivElement>) =>
    event.preventDefault();

  return (
    <section
      className="terminal-panel program-panel"
      aria-labelledby="program-title"
    >
      <div className="program-editor-grid">
        <aside
          className="palette-column"
          aria-label="Palette de blocs de programmation"
        >
          <div className="palette-label">PALETTE DE BLOCS</div>
          <p className="palette-help">Glissez un bloc dans la zone centrale.</p>
          <div className="block-palette">
            <PaletteBlock
              kind="advance"
              onAdd={onAdd}
              onDragStart={(event, kind) => {
                event.dataTransfer.setData('text/plain', `palette:${kind}`);
                event.dataTransfer.effectAllowed = 'copy';
              }}
              disabled={isRunning}
            />
            <PaletteBlock
              kind="left"
              onAdd={onAdd}
              onDragStart={(event, kind) => {
                event.dataTransfer.setData('text/plain', `palette:${kind}`);
                event.dataTransfer.effectAllowed = 'copy';
              }}
              disabled={isRunning}
            />
            <PaletteBlock
              kind="right"
              onAdd={onAdd}
              onDragStart={(event, kind) => {
                event.dataTransfer.setData('text/plain', `palette:${kind}`);
                event.dataTransfer.effectAllowed = 'copy';
              }}
              disabled={isRunning}
            />
            <PaletteBlock
              kind="repeat"
              onAdd={onAdd}
              onDragStart={(event, kind) => {
                event.dataTransfer.setData('text/plain', `palette:${kind}`);
                event.dataTransfer.effectAllowed = 'copy';
              }}
              disabled={isRunning}
            />
            <PaletteBlock
              kind="if"
              onAdd={onAdd}
              onDragStart={(event, kind) => {
                event.dataTransfer.setData('text/plain', `palette:${kind}`);
                event.dataTransfer.effectAllowed = 'copy';
              }}
              disabled={isRunning}
            />
          </div>
        </aside>

        <div className="program-workspace">
          <div className="program-heading">
            <div>
              <h2 id="program-title">Construisez le trajet</h2>
            </div>
            <Zap className="heading-spark" aria-hidden="true" />
          </div>

          <p className="program-help">
            Construisez le programme de haut en bas. Utilisez une boucle pour
            compresser les répétitions et un bloc SI pour réagir à la carte.
          </p>

          <div className="program-label-row">
            <span className="palette-label">VOTRE PROGRAMME</span>
          </div>

          <div
            className={`program-list ${program.length === 0 ? 'is-empty' : ''}`}
            onDragOver={allowDrop}
            onDrop={(event) => onDrop(event, program.length)}
            aria-label="Programme du robot"
          >
            {program.length === 0 && (
              <div className="empty-program">
                <div className="empty-program-icon">
                  <ArrowDown aria-hidden="true" />
                </div>
                <span>Déposez vos blocs ici</span>
                <small>ou cliquez dans la palette à gauche</small>
              </div>
            )}

            {program.map((block, index) => (
              <div key={block.id} className="program-row">
                <div
                  className="drop-zone"
                  onDragOver={allowDrop}
                  onDrop={(event) => onDrop(event, index)}
                  aria-hidden="true"
                />
                <ProgramBlock
                  block={block}
                  index={index}
                  total={program.length}
                  onChange={onChange}
                  onDelete={onDelete}
                  onMove={onMove}
                  onDragStart={onDragStart}
                  disabled={isRunning}
                />
              </div>
            ))}
            {program.length > 0 && (
              <div className="drop-zone bottom-drop" aria-hidden="true" />
            )}
          </div>

          {feedback.tone !== 'neutral' && (
            <output
              className={`run-feedback feedback-${feedback.tone}`}
              aria-live="polite"
            >
              {feedback.tone === 'success' ? (
                <Check aria-hidden="true" />
              ) : (
                <X aria-hidden="true" />
              )}
              <span>{feedback.message}</span>
            </output>
          )}

          <div className="program-actions">
            <Button
              type="button"
              size="lg"
              className="execute-button"
              onClick={onExecute}
              disabled={isRunning}
            >
              <Play aria-hidden="true" />
              {isRunning ? 'EXÉCUTION…' : 'EXÉCUTER'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="reset-button"
              onClick={onReset}
              disabled={isRunning}
            >
              <RotateCcw aria-hidden="true" />
              EFFACER
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function ChallengeScreen({
  maze,
  robot,
  program,
  feedback,
  isRunning,
  onAdd,
  onChange,
  onDelete,
  onMove,
  onDrop,
  onDragStart,
  onExecute,
  onReset,
}: {
  maze: MazeVariant;
  robot: RobotState;
  program: Instruction[];
  feedback: Feedback;
  isRunning: boolean;
  onAdd: (kind: BlockKind) => void;
  onChange: (id: string, patch: Partial<Instruction>) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, offset: -1 | 1) => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>, index: number) => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>, id: string) => void;
  onExecute: () => void;
  onReset: () => void;
}) {
  return (
    <section
      className="challenge-layout"
      aria-label="Épreuve 2 : programmation du robot"
    >
      <div className="challenge-grid">
        <ProgramPanel
          program={program}
          feedback={feedback}
          isRunning={isRunning}
          onAdd={onAdd}
          onChange={onChange}
          onDelete={onDelete}
          onMove={onMove}
          onDrop={onDrop}
          onDragStart={onDragStart}
          onExecute={onExecute}
          onReset={onReset}
        />
        <MazePanel maze={maze} robot={robot} />
      </div>
    </section>
  );
}

function BinaryRows({ title, rows }: { title: string; rows: string[] }) {
  const sectionId = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  return (
    <section className="binary-source" aria-labelledby={`${sectionId}-title`}>
      <div className="binary-source-heading">
        <h3 id={`${sectionId}-title`}>{title}</h3>
      </div>
      <div className="binary-row-list">
        {rows.map((row, index) => (
          <code className="binary-row" key={`${title}-${row}-${index}`}>
            {row}
          </code>
        ))}
      </div>
    </section>
  );
}

function BinaryChallengeScreen({
  variant,
  answer,
  feedback,
  solved,
  onChange,
  onSubmit,
}: {
  variant: BinaryVariant;
  answer: string;
  feedback: Feedback;
  solved: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <section className="binary-layout" aria-label="Épreuve 3 : image binaire">
      <div className="binary-panel terminal-panel">
        <div className="binary-heading">
          <h2>Épreuve 3 - Image binaire</h2>
        </div>

        <div className="binary-instruction-card">
          <h3>Consigne</h3>
          <p>
            Chaque groupe de 8 bits correspond à une ligne d&apos;une image de 8
            × 8 pixels.
          </p>
          <p>
            <strong>0</strong> = laisse la case vide&nbsp; · &nbsp;
            <strong>1</strong> = colorie la case en noir.
          </p>
          <p>
            Sur une feuille, représente chaque lettre en suivant son code
            binaire. Lis les groupes de gauche à droite et reporte-les ligne par
            ligne, de haut en bas.
          </p>
          <p>
            Une fois les 8 lignes complétées, identifie les deux lettres qui
            apparaissent.
          </p>
        </div>

        <div className="binary-version-card">
          <div className="binary-source-grid">
            <BinaryRows
              title="Première lettre à trouver :"
              rows={variant.first}
            />
            <BinaryRows
              title="Deuxième lettre à trouver :"
              rows={variant.second}
            />
          </div>

          <form
            className="binary-answer-panel"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit();
            }}
          >
            <div className="binary-answer-row">
              <label htmlFor="binary-answer">Code :</label>
              <input
                id="binary-answer"
                className="binary-answer-input"
                value={answer}
                onChange={(event) => onChange(event.target.value)}
                maxLength={4}
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                placeholder="____"
                aria-label="Code de l'image binaire"
                disabled={solved}
              />
              <Button
                type="submit"
                size="lg"
                className="binary-submit"
                disabled={solved}
              >
                {solved ? (
                  <Check aria-hidden="true" />
                ) : (
                  <ArrowRight aria-hidden="true" />
                )}
                {solved ? 'ÉPREUVE VALIDÉE' : 'VALIDER'}
              </Button>
            </div>
            {feedback.tone !== 'neutral' && (
              <output
                className={`run-feedback feedback-${feedback.tone}`}
                aria-live="polite"
              >
                {feedback.tone === 'success' ? (
                  <Check aria-hidden="true" />
                ) : (
                  <X aria-hidden="true" />
                )}
                <span>{feedback.message}</span>
              </output>
            )}
          </form>
        </div>
      </div>
    </section>
  );
}

function EnergyCard({
  source,
  selected,
  disabled,
  onSelect,
  onDragStart,
  onDragEnd,
}: {
  source: EnergySource;
  selected: boolean;
  disabled: boolean;
  onSelect: (sourceId: string) => void;
  onDragStart: (
    event: React.DragEvent<HTMLButtonElement>,
    sourceId: string,
  ) => void;
  onDragEnd: () => void;
}) {
  const column = source.tile % 5;
  const row = Math.floor(source.tile / 5);

  return (
    <button
      type="button"
      className={`energy-card ${selected ? 'is-selected' : ''}`}
      draggable={!disabled}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(source.id);
      }}
      onDragStart={(event) => onDragStart(event, source.id)}
      onDragEnd={onDragEnd}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={source.name}
    >
      <span
        className="energy-art"
        style={{
          backgroundImage: "url('./energy-sources.png')",
          backgroundPosition: `${column * 25}% ${row * (100 / 3)}%`,
        }}
        aria-hidden="true"
      />
      <span className="energy-card-name">{source.name}</span>
    </button>
  );
}

function EnergyFolder({
  category,
  sources,
  selectedEnergyId,
  solved,
  onSelect,
  onAssign,
  onDragStart,
  onDragEnd,
}: {
  category: EnergyCategory;
  sources: EnergySource[];
  selectedEnergyId: string | null;
  solved: boolean;
  onSelect: (sourceId: string) => void;
  onAssign: (sourceId: string, category: EnergyCategory) => void;
  onDragStart: (
    event: React.DragEvent<HTMLButtonElement>,
    sourceId: string,
  ) => void;
  onDragEnd: () => void;
}) {
  const title =
    category === 'renewable' ? 'Renouvelables' : 'Non renouvelables';

  const chooseFolder = () => {
    if (selectedEnergyId && !solved) onAssign(selectedEnergyId, category);
  };

  return (
    /* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- drop zone */
    <section
      className={`energy-folder energy-folder-${category}`}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      }}
      onDrop={(event) => {
        event.preventDefault();
        const payload = event.dataTransfer.getData('text/plain');
        if (payload.startsWith('energy:')) {
          onAssign(payload.replace('energy:', ''), category);
        }
      }}
      aria-label={`Dossier ${title}`}
    >
      <button
        type="button"
        className="energy-folder-title"
        onClick={chooseFolder}
        disabled={solved}
        aria-label={`Placer la carte sélectionnée dans le dossier ${title}`}
      >
        <h3>{title}</h3>
      </button>
      <div className="energy-folder-grid">
        {sources.length > 0 ? (
          sources.map((source) => (
            <EnergyCard
              key={source.id}
              source={source}
              selected={selectedEnergyId === source.id}
              disabled={solved}
              onSelect={onSelect}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
          ))
        ) : (
          <span className="energy-empty-folder">Déposer ici</span>
        )}
      </div>
    </section>
  );
}

function EnergyChallengeScreen({
  assignments,
  selectedEnergyId,
  feedback,
  solved,
  onSelect,
  onAssign,
  onReturn,
  onDrop,
  onDragStart,
  onDragEnd,
}: {
  assignments: Record<string, EnergyCategory>;
  selectedEnergyId: string | null;
  feedback: Feedback;
  solved: boolean;
  onSelect: (sourceId: string) => void;
  onAssign: (sourceId: string, category: EnergyCategory) => void;
  onReturn: (sourceId: string) => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragStart: (
    event: React.DragEvent<HTMLButtonElement>,
    sourceId: string,
  ) => void;
  onDragEnd: () => void;
}) {
  const unassigned = ENERGY_SOURCES.filter((source) => !assignments[source.id]);
  const renewable = ENERGY_SOURCES.filter(
    (source) => assignments[source.id] === 'renewable',
  );
  const nonrenewable = ENERGY_SOURCES.filter(
    (source) => assignments[source.id] === 'nonrenewable',
  );

  return (
    <section
      className="energy-layout"
      aria-label="Épreuve 4 : tri des sources d’énergie"
    >
      <div className="energy-panel terminal-panel">
        <div className="energy-heading">
          <h2>Classez les sources d’énergie</h2>
        </div>

        <p className="energy-instruction">
          Glissez chaque carte dans le bon dossier.
        </p>

        <div className="energy-board">
          {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- drop zone */}
          <section
            className="energy-bank"
            aria-labelledby="energy-bank-title"
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
            }}
            onDrop={onDrop}
          >
            <button
              type="button"
              className="energy-bank-title"
              onClick={() => {
                if (selectedEnergyId && !solved) onReturn(selectedEnergyId);
              }}
              disabled={solved}
              aria-label="Rendre la carte sélectionnée aux sources à trier"
            >
              <h3 id="energy-bank-title">Sources à trier</h3>
            </button>
            <div className="energy-bank-grid">
              {unassigned.length > 0 ? (
                unassigned.map((source) => (
                  <EnergyCard
                    key={source.id}
                    source={source}
                    selected={selectedEnergyId === source.id}
                    disabled={solved}
                    onSelect={onSelect}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                  />
                ))
              ) : (
                <span className="energy-empty-bank">
                  Toutes les cartes sont classées
                </span>
              )}
            </div>
          </section>

          <div className="energy-folder-grid-wrap">
            <EnergyFolder
              category="renewable"
              sources={renewable}
              selectedEnergyId={selectedEnergyId}
              solved={solved}
              onSelect={onSelect}
              onAssign={onAssign}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
            <EnergyFolder
              category="nonrenewable"
              sources={nonrenewable}
              selectedEnergyId={selectedEnergyId}
              solved={solved}
              onSelect={onSelect}
              onAssign={onAssign}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
          </div>
        </div>

        {feedback.tone !== 'neutral' && (
          <output
            className={`run-feedback feedback-${feedback.tone}`}
            aria-live="polite"
          >
            {feedback.tone === 'success' ? (
              <Check aria-hidden="true" />
            ) : (
              <X aria-hidden="true" />
            )}
            <span>{feedback.message}</span>
          </output>
        )}
      </div>
    </section>
  );
}

function ElevatorBlockIcon({ kind }: { kind: ElevatorBlockKind }) {
  if (kind === 'open-doors') return <DoorOpen aria-hidden="true" />;
  if (kind === 'close-doors') return <LockKeyhole aria-hidden="true" />;
  if (kind === 'move-up') return <ArrowUp aria-hidden="true" />;
  if (kind === 'move-down') return <ArrowDown aria-hidden="true" />;
  if (kind === 'if') return <GitBranch aria-hidden="true" />;
  if (kind === 'repeat') return <RotateCcw aria-hidden="true" />;
  return <ArrowRight aria-hidden="true" />;
}

function ElevatorActionOptions() {
  return (
    <>
      <option value="none">RIEN</option>
      {(
        [
          'open-doors',
          'close-doors',
          'choose-next',
          'move-up',
          'move-down',
        ] as const
      ).map((action) => (
        <option key={action} value={action}>
          {elevatorActionLabel[action]}
        </option>
      ))}
    </>
  );
}

function ElevatorInstructionBlock({
  block,
  index,
  total,
  selectedLoopId,
  onSelectLoop,
  onChange,
  onDelete,
  onMove,
  disabled,
}: {
  block: ElevatorInstruction;
  index: number;
  total: number;
  selectedLoopId: string | null;
  onSelectLoop: (id: string) => void;
  onChange: (id: string, patch: Partial<ElevatorInstruction>) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, offset: -1 | 1) => void;
  disabled: boolean;
}) {
  const controls = (
    <div className="elevator-block-controls">
      <button
        type="button"
        className="icon-button elevator-icon-button"
        onClick={() => onMove(block.id, -1)}
        disabled={disabled || index === 0}
        aria-label="Monter le bloc"
      >
        <ChevronUp aria-hidden="true" />
      </button>
      <button
        type="button"
        className="icon-button elevator-icon-button"
        onClick={() => onMove(block.id, 1)}
        disabled={disabled || index === total - 1}
        aria-label="Descendre le bloc"
      >
        <ChevronDown aria-hidden="true" />
      </button>
      <button
        type="button"
        className="icon-button elevator-icon-button elevator-delete-button"
        onClick={() => onDelete(block.id)}
        disabled={disabled}
        aria-label="Supprimer le bloc"
      >
        <Trash2 aria-hidden="true" />
      </button>
    </div>
  );

  if (block.kind === 'repeat') {
    const children = block.children ?? [];
    return (
      <div
        className={`elevator-program-block elevator-repeat-block ${
          selectedLoopId === block.id ? 'is-selected' : ''
        }`}
      >
        <div className="elevator-block-row elevator-repeat-heading">
          <button
            type="button"
            className="elevator-loop-select"
            onClick={() => onSelectLoop(block.id)}
            disabled={disabled}
            aria-pressed={selectedLoopId === block.id}
            aria-label="Sélectionner cette boucle"
          >
            <GripVertical className="elevator-grip" aria-hidden="true" />
            <span className="elevator-block-icon">
              <ElevatorBlockIcon kind={block.kind} />
            </span>
            <span className="elevator-keyword">RÉPÉTER</span>
          </button>
          <input
            className="elevator-count-input"
            type="number"
            min={1}
            max={24}
            value={block.count ?? 12}
            onChange={(event) => {
              const nextCount = Number(event.target.value);
              onChange(block.id, {
                count: Number.isFinite(nextCount)
                  ? Math.min(24, Math.max(1, nextCount))
                  : 1,
              });
            }}
            aria-label="Nombre de répétitions"
            disabled={disabled}
          />
          <span className="elevator-unit">fois</span>
          {controls}
        </div>
        <div className="elevator-loop-body">
          {children.length > 0 ? (
            children.map((child, childIndex) => (
              <ElevatorInstructionBlock
                key={child.id}
                block={child}
                index={childIndex}
                total={children.length}
                selectedLoopId={selectedLoopId}
                onSelectLoop={onSelectLoop}
                onChange={onChange}
                onDelete={onDelete}
                onMove={onMove}
                disabled={disabled}
              />
            ))
          ) : (
            <div className="elevator-loop-empty">BLOCS DANS LA BOUCLE</div>
          )}
        </div>
      </div>
    );
  }

  if (block.kind === 'if') {
    return (
      <div className="elevator-program-block elevator-if-block">
        <div className="elevator-block-row elevator-if-row">
          <GripVertical className="elevator-grip" aria-hidden="true" />
          <span className="elevator-block-icon">
            <ElevatorBlockIcon kind={block.kind} />
          </span>
          <span className="elevator-keyword">SI</span>
          <select
            className="elevator-select elevator-condition-select"
            value={block.condition ?? 'request-above'}
            onChange={(event) =>
              onChange(block.id, {
                condition: event.target.value as ElevatorCondition,
              })
            }
            aria-label="Condition de l'ascenseur"
            disabled={disabled}
          >
            {Object.entries(elevatorConditionLabel).map(
              ([condition, label]) => (
                <option key={condition} value={condition}>
                  {label}
                </option>
              ),
            )}
          </select>
          <span className="elevator-branch-word">ALORS</span>
          <select
            className="elevator-select elevator-action-select"
            value={block.thenAction ?? 'move-up'}
            onChange={(event) =>
              onChange(block.id, {
                thenAction: event.target.value as ElevatorActionKind,
              })
            }
            aria-label="Action si vrai"
            disabled={disabled}
          >
            <ElevatorActionOptions />
          </select>
          <span className="elevator-branch-word">SINON</span>
          <select
            className="elevator-select elevator-action-select"
            value={block.elseAction ?? 'none'}
            onChange={(event) =>
              onChange(block.id, {
                elseAction: event.target.value as ElevatorActionKind,
              })
            }
            aria-label="Action si faux"
            disabled={disabled}
          >
            <ElevatorActionOptions />
          </select>
          {controls}
        </div>
      </div>
    );
  }

  return (
    <div className="elevator-program-block elevator-action-block">
      <div className="elevator-block-row">
        <GripVertical className="elevator-grip" aria-hidden="true" />
        <span className="elevator-block-icon">
          <ElevatorBlockIcon kind={block.kind} />
        </span>
        <span className="elevator-action-label">
          {elevatorActionLabel[block.kind]}
        </span>
        {controls}
      </div>
    </div>
  );
}

function ElevatorProgramPanel({
  program,
  selectedLoopId,
  feedback,
  isRunning,
  onAdd,
  onSelectLoop,
  onChange,
  onDelete,
  onMove,
  onExecute,
  onReset,
}: {
  program: ElevatorInstruction[];
  selectedLoopId: string | null;
  feedback: Feedback;
  isRunning: boolean;
  onAdd: (kind: ElevatorBlockKind) => void;
  onSelectLoop: (id: string) => void;
  onChange: (id: string, patch: Partial<ElevatorInstruction>) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, offset: -1 | 1) => void;
  onExecute: () => void;
  onReset: () => void;
}) {
  const palette: ElevatorBlockKind[] = [
    'choose-next',
    'open-doors',
    'close-doors',
    'move-up',
    'move-down',
    'if',
    'repeat',
  ];

  return (
    <section
      className="terminal-panel elevator-program-panel"
      aria-labelledby="elevator-program-title"
    >
      <div className="elevator-editor-grid">
        <aside
          className="elevator-palette"
          aria-label="Palette de blocs de l'ascenseur"
        >
          <div className="palette-label">PALETTE DE BLOCS</div>
          <p className="elevator-palette-help">
            Cliquez sur une boucle pour y ajouter des blocs.
          </p>
          <div className="elevator-block-palette">
            {palette.map((kind) => (
              <button
                type="button"
                key={kind}
                className={`elevator-palette-block elevator-palette-${kind}`}
                onClick={() => onAdd(kind)}
                disabled={isRunning}
              >
                <span className="elevator-block-icon">
                  <ElevatorBlockIcon kind={kind} />
                </span>
                <span>
                  {kind === 'if'
                    ? 'SI / IF'
                    : kind === 'repeat'
                      ? 'RÉPÉTER'
                      : elevatorActionLabel[kind]}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <div className="elevator-program-workspace">
          <div className="elevator-program-heading">
            <div>
              <div className="palette-label">ÉPREUVE 5</div>
              <h2 id="elevator-program-title">Programmez l’ascenseur</h2>
            </div>
            <Zap className="heading-spark" aria-hidden="true" />
          </div>

          <div
            className="elevator-program-list"
            aria-label="Programme de l'ascenseur"
          >
            {program.length > 0 ? (
              program.map((block, index) => (
                <ElevatorInstructionBlock
                  key={block.id}
                  block={block}
                  index={index}
                  total={program.length}
                  selectedLoopId={selectedLoopId}
                  onSelectLoop={onSelectLoop}
                  onChange={onChange}
                  onDelete={onDelete}
                  onMove={onMove}
                  disabled={isRunning}
                />
              ))
            ) : (
              <div className="elevator-program-empty">
                <ArrowDown aria-hidden="true" />
                <span>AJOUTEZ DES BLOCS</span>
              </div>
            )}
          </div>

          {feedback.tone !== 'neutral' && (
            <output
              className={`run-feedback feedback-${feedback.tone}`}
              aria-live="polite"
            >
              {feedback.tone === 'success' ? (
                <Check aria-hidden="true" />
              ) : (
                <X aria-hidden="true" />
              )}
              <span>{feedback.message}</span>
            </output>
          )}

          <div className="elevator-program-actions">
            <Button
              type="button"
              size="lg"
              className="execute-button"
              onClick={onExecute}
              disabled={isRunning}
            >
              <Play aria-hidden="true" />
              {isRunning ? 'EXÉCUTION…' : 'EXÉCUTER'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="reset-button"
              onClick={onReset}
              disabled={isRunning}
            >
              <RotateCcw aria-hidden="true" />
              EFFACER
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function ElevatorVisualPanel({
  floor,
  doorsOpen,
  target,
  requests,
  served,
  motion,
  callPending,
  solved,
  isRunning,
  onCallElevator,
  onFloorPress,
}: {
  floor: number;
  doorsOpen: boolean;
  target: number | null;
  requests: number[];
  served: number[];
  motion: ElevatorMotion;
  callPending: boolean;
  solved: boolean;
  isRunning: boolean;
  onCallElevator: () => void;
  onFloorPress: (floor: number) => void;
}) {
  return (
    <section
      className="terminal-panel elevator-visual-panel"
      aria-labelledby="elevator-visual-title"
    >
      <div className="elevator-visual-heading">
        <div>
          <div className="palette-label">SYSTÈME</div>
          <h2 id="elevator-visual-title">Ascenseur central</h2>
        </div>
        <div
          className={`elevator-motion-readout elevator-motion-${motion}`}
          aria-live="polite"
        >
          {motion === 'up' ? (
            <ArrowUp aria-hidden="true" />
          ) : motion === 'down' ? (
            <ArrowDown aria-hidden="true" />
          ) : (
            <CircleDot aria-hidden="true" />
          )}
          <span>
            {motion === 'up'
              ? 'MONTE'
              : motion === 'down'
                ? 'DESCEND'
                : 'À L’ARRÊT'}
          </span>
        </div>
      </div>

      <div
        className={`elevator-visual ${doorsOpen ? 'is-open' : 'is-closed'} elevator-motion-${motion}`}
      >
        {/* oxlint-disable-next-line next/no-img-element -- local generated cabin asset */}
        <img src="./elevator-cabin.png" alt="Cabine d'ascenseur" />
        <div className="elevator-door elevator-door-left" aria-hidden="true" />
        <div className="elevator-door elevator-door-right" aria-hidden="true" />
        <div className="elevator-floor-readout">
          <span>ÉTAGE</span>
          <strong>{floor}</strong>
          {target !== null && <small>→ {target}</small>}
        </div>
      </div>

      <div className="elevator-status-row" aria-live="polite">
        <span className={`elevator-door-status ${doorsOpen ? 'is-open' : ''}`}>
          {doorsOpen ? 'PORTES OUVERTES' : 'PORTES FERMÉES'}
        </span>
        <span>
          {requests.length > 0
            ? `DEMANDES ${requests.join(' · ')}`
            : 'AUCUNE DEMANDE'}
        </span>
      </div>

      <div className="elevator-call-panel">
        <div className="elevator-call-control">
          <div>
            <div className="palette-label">APPEL</div>
            <span className="elevator-call-status">
              {callPending ? 'APPEL EN ATTENTE' : 'AU REZ-DE-CHAUSSÉE'}
            </span>
          </div>
          <button
            type="button"
            className={`elevator-call-button ${callPending ? 'is-pending' : ''}`}
            onClick={onCallElevator}
            disabled={isRunning || solved || callPending}
          >
            <Bell aria-hidden="true" />
            {callPending ? 'APPEL ENREGISTRÉ' : 'APPELER'}
          </button>
        </div>

        <div className="palette-label elevator-destination-label">
          DESTINATIONS
        </div>
        <div className="elevator-floor-buttons">
          {ELEVATOR_FLOORS.map((requestedFloor) => {
            const isPending =
              requests.includes(requestedFloor) || target === requestedFloor;
            const isServed = served.includes(requestedFloor);
            return (
              <button
                type="button"
                key={requestedFloor}
                className={`elevator-floor-button ${isPending ? 'is-pending' : ''} ${
                  isServed ? 'is-served' : ''
                } ${requestedFloor === floor ? 'is-current' : ''}`}
                onClick={() => onFloorPress(requestedFloor)}
                disabled={isRunning || solved}
                aria-pressed={isPending}
                aria-label={`Choisir l'étage ${requestedFloor}`}
              >
                {requestedFloor}
              </button>
            );
          })}
        </div>
      </div>

      {served.length > 0 && (
        <div className="elevator-served-row" aria-live="polite">
          <span className="palette-label">ARRÊTS</span>
          <span>{served.join(' → ')}</span>
        </div>
      )}

      {solved && <div className="elevator-final-state">SYSTÈME VALIDÉ</div>}
    </section>
  );
}

function ElevatorChallengeScreen({
  program,
  selectedLoopId,
  floor,
  doorsOpen,
  target,
  requests,
  served,
  motion,
  callPending,
  feedback,
  solved,
  isRunning,
  onAdd,
  onSelectLoop,
  onChange,
  onDelete,
  onMove,
  onExecute,
  onReset,
  onCallElevator,
  onFloorPress,
}: {
  program: ElevatorInstruction[];
  selectedLoopId: string | null;
  floor: number;
  doorsOpen: boolean;
  target: number | null;
  requests: number[];
  served: number[];
  motion: ElevatorMotion;
  callPending: boolean;
  feedback: Feedback;
  solved: boolean;
  isRunning: boolean;
  onAdd: (kind: ElevatorBlockKind) => void;
  onSelectLoop: (id: string) => void;
  onChange: (id: string, patch: Partial<ElevatorInstruction>) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, offset: -1 | 1) => void;
  onExecute: () => void;
  onReset: () => void;
  onCallElevator: () => void;
  onFloorPress: (floor: number) => void;
}) {
  return (
    <section
      className="elevator-layout"
      aria-label="Épreuve 5 : programmation de l’ascenseur"
    >
      <div className="elevator-mission-strip">
        Appelez l’ascenseur, choisissez 7, 3 et 5, puis programmez les portes et
        les déplacements.
      </div>
      <div className="elevator-grid">
        <ElevatorProgramPanel
          program={program}
          selectedLoopId={selectedLoopId}
          feedback={feedback}
          isRunning={isRunning}
          onAdd={onAdd}
          onSelectLoop={onSelectLoop}
          onChange={onChange}
          onDelete={onDelete}
          onMove={onMove}
          onExecute={onExecute}
          onReset={onReset}
        />
        <ElevatorVisualPanel
          floor={floor}
          doorsOpen={doorsOpen}
          target={target}
          requests={requests}
          served={served}
          motion={motion}
          solved={solved}
          isRunning={isRunning}
          callPending={callPending}
          onCallElevator={onCallElevator}
          onFloorPress={onFloorPress}
        />
      </div>
    </section>
  );
}

function ScratchMazePanel({ snapshot }: ScratchPanelProps) {
  const state = snapshot?.mode === 'maze' ? snapshot.state : null;
  return (
    <MazePanel
      maze={MAZE_VARIANT}
      robot={{
        row: state?.row ?? 6,
        col: state?.col ?? 1,
        direction: scratchDirectionToMaze(state?.direction ?? 1),
        collected: state?.hasKey ? ['key'] : [],
      }}
    />
  );
}

function ScratchElevatorPanel({ snapshot, controls }: ScratchPanelProps) {
  const state = snapshot?.mode === 'elevator' ? snapshot.state : null;
  return (
    <ElevatorVisualPanel
      floor={state?.floor ?? 0}
      doorsOpen={state?.doorsOpen ?? false}
      target={state?.target ?? null}
      requests={[
        ...new Set([...(state?.calls ?? []), ...(state?.destinations ?? [])]),
      ]}
      served={state?.served ?? []}
      motion={state?.motion ?? 'idle'}
      callPending={state?.calls.includes(0) ?? false}
      solved={false}
      isRunning={!controls.ready}
      onCallElevator={() => controls.call(0)}
      onFloorPress={controls.destination}
    />
  );
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>('access');
  const [accessCode, setAccessCode] = useState('');
  const [accessError, setAccessError] = useState('');
  const [program, setProgram] = useState<Instruction[]>([]);
  const [robot, setRobot] = useState<RobotState>(INITIAL_ROBOT);
  const [feedback, setFeedback] = useState<Feedback>(INITIAL_FEEDBACK);
  const [binaryVariant, setBinaryVariant] = useState<BinaryVariantId>('A');
  const [binaryAnswer, setBinaryAnswer] = useState('');
  const [binaryFeedback, setBinaryFeedback] = useState<Feedback>(
    INITIAL_BINARY_FEEDBACK,
  );
  const [binarySolved, setBinarySolved] = useState(false);
  const [energyAssignments, setEnergyAssignments] = useState<
    Record<string, EnergyCategory>
  >({});
  const [energyFeedback, setEnergyFeedback] = useState<Feedback>(
    INITIAL_ENERGY_FEEDBACK,
  );
  const [energySolved, setEnergySolved] = useState(false);
  const [selectedEnergyId, setSelectedEnergyId] = useState<string | null>(null);
  const [elevatorProgram, setElevatorProgram] = useState<ElevatorInstruction[]>(
    [],
  );
  const [selectedElevatorLoopId, setSelectedElevatorLoopId] = useState<
    string | null
  >(null);
  const [elevatorFloor, setElevatorFloor] = useState(0);
  const [elevatorDoorsOpen, setElevatorDoorsOpen] = useState(false);
  const [elevatorTarget, setElevatorTarget] = useState<number | null>(null);
  const [elevatorRequests, setElevatorRequests] = useState<number[]>([]);
  const [elevatorServed, setElevatorServed] = useState<number[]>([]);
  const [elevatorMotion, setElevatorMotion] = useState<ElevatorMotion>('idle');
  const [elevatorCallPending, setElevatorCallPending] = useState(false);
  const [elevatorFeedback, setElevatorFeedback] = useState<Feedback>(
    INITIAL_ELEVATOR_FEEDBACK,
  );
  const [elevatorSolved, setElevatorSolved] = useState(false);
  const [isElevatorRunning, setIsElevatorRunning] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);
  const blockId = useRef(0);
  const runId = useRef(0);
  const runTimer = useRef<number | null>(null);
  const elevatorBlockId = useRef(0);
  const elevatorRunId = useRef(0);
  const elevatorTimer = useRef<number | null>(null);
  const activeMaze = MAZE_VARIANT;
  const activeBinaryVariant =
    BINARY_VARIANTS.find((variant) => variant.id === binaryVariant) ??
    BINARY_VARIANTS[0];

  useEffect(() => {
    try {
      const rawSession = window.localStorage.getItem(SESSION_STORAGE_KEY);
      if (rawSession) {
        const savedSession = JSON.parse(rawSession) as {
          accessCode?: unknown;
          screen?: unknown;
          program?: unknown;
          robot?: unknown;
          mazeVersion?: unknown;
          binaryVariant?: unknown;
          binaryAnswer?: unknown;
          binarySolved?: unknown;
          energyAssignments?: unknown;
          energySolved?: unknown;
          elevatorProgram?: unknown;
          elevatorFloor?: unknown;
          elevatorDoorsOpen?: unknown;
          elevatorTarget?: unknown;
          elevatorRequests?: unknown;
          elevatorServed?: unknown;
          elevatorCallPending?: unknown;
          elevatorSolved?: unknown;
        };
        const restoredCode =
          typeof savedSession.accessCode === 'string'
            ? savedSession.accessCode.replace(/\D/g, '').slice(0, 4)
            : '';
        const mazeLayoutMatches =
          savedSession.mazeVersion === MAZE_LAYOUT_VERSION;
        const restoredProgram = mazeLayoutMatches
          ? sanitizeProgram(savedSession.program)
          : [];
        const restoredRobot = mazeLayoutMatches
          ? sanitizeRobot(savedSession.robot, MAZE_VARIANT)
          : INITIAL_ROBOT;
        const restoredScreen = isScreen(savedSession.screen)
          ? savedSession.screen
          : 'access';
        const restoredBinaryVariant = isBinaryVariantId(
          savedSession.binaryVariant,
        )
          ? savedSession.binaryVariant
          : 'A';
        const restoredBinaryAnswer =
          typeof savedSession.binaryAnswer === 'string'
            ? savedSession.binaryAnswer.replace(/\D/g, '').slice(0, 4)
            : '';
        const restoredEnergyAssignments = sanitizeEnergyAssignments(
          savedSession.energyAssignments,
        );
        const restoredElevatorProgram = sanitizeElevatorProgram(
          savedSession.elevatorProgram,
        );
        const restoredElevatorRequests = sanitizeElevatorFloors(
          savedSession.elevatorRequests,
        );
        const restoredElevatorServed = sanitizeElevatorFloors(
          savedSession.elevatorServed,
        );
        const restoredElevatorCallPending =
          typeof savedSession.elevatorCallPending === 'boolean'
            ? savedSession.elevatorCallPending
            : restoredElevatorRequests.length > 0;
        const restoredElevatorFloor =
          typeof savedSession.elevatorFloor === 'number' &&
          Number.isInteger(savedSession.elevatorFloor) &&
          savedSession.elevatorFloor >= 0 &&
          savedSession.elevatorFloor <= 7
            ? savedSession.elevatorFloor
            : 0;
        const restoredElevatorTarget =
          typeof savedSession.elevatorTarget === 'number' &&
          Number.isInteger(savedSession.elevatorTarget) &&
          savedSession.elevatorTarget >= 0 &&
          savedSession.elevatorTarget <= 7
            ? savedSession.elevatorTarget
            : null;
        const hasValidAccess =
          VALID_ACCESS_CODES.includes(restoredCode) ||
          restoredCode === TEACHER_BYPASS_CODE;

        // oxlint-disable-next-line react/react-compiler -- hydrate the persisted local session
        setAccessCode(restoredCode);
        setProgram(restoredProgram);
        setRobot(restoredRobot);
        setBinaryVariant(restoredBinaryVariant);
        setBinaryAnswer(restoredBinaryAnswer);
        setBinarySolved(Boolean(savedSession.binarySolved));
        setEnergyAssignments(restoredEnergyAssignments);
        setEnergySolved(Boolean(savedSession.energySolved));
        setElevatorProgram(restoredElevatorProgram);
        setElevatorFloor(restoredElevatorFloor);
        const hasElevatorProgress =
          restoredElevatorCallPending ||
          restoredElevatorRequests.length > 0 ||
          restoredElevatorServed.length > 0 ||
          restoredElevatorFloor !== 0 ||
          restoredElevatorTarget !== null ||
          Boolean(savedSession.elevatorSolved);
        setElevatorDoorsOpen(
          hasElevatorProgress &&
            typeof savedSession.elevatorDoorsOpen === 'boolean'
            ? savedSession.elevatorDoorsOpen
            : false,
        );
        setElevatorTarget(restoredElevatorTarget);
        setElevatorRequests(restoredElevatorRequests);
        setElevatorServed(restoredElevatorServed);
        setElevatorCallPending(restoredElevatorCallPending);
        setElevatorSolved(Boolean(savedSession.elevatorSolved));
        setScreen(
          hasValidAccess && restoredScreen !== 'access'
            ? restoredScreen
            : 'access',
        );

        const highestStoredId = restoredProgram.reduce((highest, block) => {
          const match = block.id.match(/^block-(\d+)$/);
          return match ? Math.max(highest, Number(match[1])) : highest;
        }, 0);
        blockId.current = Math.max(blockId.current, highestStoredId);
        const highestElevatorId = restoredElevatorProgram.reduce(
          (highest, block) => {
            const match = block.id.match(/^elevator-block-(\d+)$/);
            return match ? Math.max(highest, Number(match[1])) : highest;
          },
          0,
        );
        elevatorBlockId.current = Math.max(
          elevatorBlockId.current,
          highestElevatorId,
        );
      }
    } catch {
      try {
        window.localStorage.removeItem(SESSION_STORAGE_KEY);
      } catch {
        // Storage can be unavailable in private browsing.
      }
    } finally {
      // oxlint-disable-next-line react/react-compiler -- hydrate the persisted local session
      setIsRestoring(false);
    }
  }, []);

  useEffect(() => {
    if (isRestoring) return;

    try {
      window.localStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({
          accessCode,
          screen,
          program,
          robot,
          mazeVersion: MAZE_LAYOUT_VERSION,
          binaryVariant,
          binaryAnswer,
          binarySolved,
          energyAssignments,
          energySolved,
          elevatorProgram,
          elevatorFloor,
          elevatorDoorsOpen,
          elevatorTarget,
          elevatorRequests,
          elevatorServed,
          elevatorCallPending,
          elevatorSolved,
        }),
      );
    } catch {
      // Storage can be unavailable in private browsing; the game still works.
    }
  }, [
    accessCode,
    binaryAnswer,
    binarySolved,
    binaryVariant,
    energyAssignments,
    energySolved,
    elevatorDoorsOpen,
    elevatorFloor,
    elevatorProgram,
    elevatorCallPending,
    elevatorRequests,
    elevatorServed,
    elevatorSolved,
    elevatorTarget,
    isRestoring,
    program,
    robot,
    screen,
  ]);

  const nextBlockId = () => {
    blockId.current += 1;
    return `block-${blockId.current}`;
  };

  const nextElevatorBlockId = () => {
    elevatorBlockId.current += 1;
    return `elevator-block-${elevatorBlockId.current}`;
  };

  const stopTimer = () => {
    if (runTimer.current !== null) {
      window.clearTimeout(runTimer.current);
      runTimer.current = null;
    }
  };

  const stopElevatorTimer = () => {
    if (elevatorTimer.current !== null) {
      window.clearTimeout(elevatorTimer.current);
      elevatorTimer.current = null;
    }
  };

  const resetChallenge = () => {
    runId.current += 1;
    stopTimer();
    setProgram([]);
    setRobot(createInitialRobot(MAZE_VARIANT));
    setFeedback(INITIAL_FEEDBACK);
    setIsRunning(false);
  };

  const resetEnergyChallenge = () => {
    setEnergyAssignments({});
    setEnergyFeedback(INITIAL_ENERGY_FEEDBACK);
    setEnergySolved(false);
    setSelectedEnergyId(null);
  };

  const resetElevatorChallenge = () => {
    elevatorRunId.current += 1;
    stopElevatorTimer();
    setElevatorProgram([]);
    setSelectedElevatorLoopId(null);
    setElevatorFloor(0);
    setElevatorDoorsOpen(false);
    setElevatorTarget(null);
    setElevatorRequests([]);
    setElevatorServed([]);
    setElevatorMotion('idle');
    setElevatorCallPending(false);
    setElevatorFeedback(INITIAL_ELEVATOR_FEEDBACK);
    setElevatorSolved(false);
    setIsElevatorRunning(false);
  };

  const openTeacherStage = (stage: Exclude<Screen, 'access' | 'teacher'>) => {
    if (stage === 'challenge') {
      resetChallenge();
    }

    if (stage === 'stage3') {
      const nextBinaryVariant =
        BINARY_VARIANTS[Math.floor(Math.random() * BINARY_VARIANTS.length)];
      setBinaryVariant(nextBinaryVariant.id);
      setBinaryAnswer('');
      setBinaryFeedback(INITIAL_BINARY_FEEDBACK);
      setBinarySolved(false);
    }

    if (stage === 'stage4') {
      resetEnergyChallenge();
    }

    if (stage === 'stage5') {
      resetElevatorChallenge();
    }

    setScreen(stage);
  };

  const handleAccessSubmit = () => {
    if (accessCode === TEACHER_BYPASS_CODE) {
      setAccessError('');
      setScreen('teacher');
      return;
    }

    if (VALID_ACCESS_CODES.includes(accessCode)) {
      const nextBinaryVariant =
        BINARY_VARIANTS[Math.floor(Math.random() * BINARY_VARIANTS.length)];
      setAccessError('');
      setBinaryVariant(nextBinaryVariant.id);
      setBinaryAnswer('');
      setBinaryFeedback(INITIAL_BINARY_FEEDBACK);
      setBinarySolved(false);
      resetEnergyChallenge();
      resetElevatorChallenge();
      resetChallenge();
      setScreen('challenge');
      return;
    }

    setAccessError('Code refusé. Vérifiez les quatre chiffres.');
  };

  const addInstruction = (kind: BlockKind) => {
    if (isRunning || program.length >= MAX_BLOCKS) return;
    setProgram((current) => [...current, makeInstruction(kind, nextBlockId)]);
    setFeedback({
      tone: 'neutral',
      message: 'Bloc ajouté. Continuez le protocole.',
    });
  };

  const updateInstruction = (id: string, patch: Partial<Instruction>) => {
    setProgram((current) =>
      current.map((block) =>
        block.id === id ? { ...block, ...patch } : block,
      ),
    );
  };

  const deleteInstruction = (id: string) => {
    setProgram((current) => current.filter((block) => block.id !== id));
    setFeedback({ tone: 'neutral', message: 'Bloc retiré du programme.' });
  };

  const moveInstruction = (id: string, offset: -1 | 1) => {
    setProgram((current) => {
      const index = current.findIndex((block) => block.id === id);
      const nextIndex = index + offset;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length)
        return current;

      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
    setFeedback({
      tone: 'neutral',
      message:
        offset < 0
          ? 'Bloc remonté dans le programme.'
          : 'Bloc descendu dans le programme.',
    });
  };

  const handleProgramDrop = (
    event: React.DragEvent<HTMLDivElement>,
    index: number,
  ) => {
    event.preventDefault();
    if (isRunning) return;

    const payload = event.dataTransfer.getData('text/plain');
    if (payload.startsWith('palette:')) {
      const kind = payload.replace('palette:', '') as BlockKind;
      if (!['advance', 'left', 'right', 'repeat', 'if'].includes(kind)) return;
      if (program.length >= MAX_BLOCKS) return;

      const newBlock = makeInstruction(kind, nextBlockId);
      setProgram((current) => {
        const next = [...current];
        next.splice(index, 0, newBlock);
        return next;
      });
      setFeedback({
        tone: 'neutral',
        message: 'Bloc déposé dans le programme.',
      });
      return;
    }

    if (!payload.startsWith('block:')) return;
    const draggedId = payload.replace('block:', '');
    const fromIndex = program.findIndex((block) => block.id === draggedId);
    if (fromIndex === -1) return;

    setProgram((current) => {
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      const adjustedIndex = fromIndex < index ? index - 1 : index;
      next.splice(Math.max(0, adjustedIndex), 0, moved);
      return next;
    });
  };

  const handleBlockDragStart = (
    event: React.DragEvent<HTMLDivElement>,
    id: string,
  ) => {
    event.dataTransfer.setData('text/plain', `block:${id}`);
    event.dataTransfer.effectAllowed = 'move';
  };

  const addElevatorInstruction = (kind: ElevatorBlockKind) => {
    if (isElevatorRunning || elevatorSolved) return;

    const nextBlock = makeElevatorInstruction(kind, nextElevatorBlockId);
    setElevatorProgram((current) => {
      if (selectedElevatorLoopId) {
        const nested = appendElevatorBlock(
          current,
          selectedElevatorLoopId,
          nextBlock,
        );
        if (nested.inserted) return nested.blocks;
      }
      return [...current, nextBlock];
    });
    if (kind === 'repeat') setSelectedElevatorLoopId(nextBlock.id);
    setElevatorFeedback(INITIAL_ELEVATOR_FEEDBACK);
  };

  const selectElevatorLoop = (id: string) => {
    if (isElevatorRunning || elevatorSolved) return;
    setSelectedElevatorLoopId((current) => (current === id ? null : id));
  };

  const updateElevatorInstruction = (
    id: string,
    patch: Partial<ElevatorInstruction>,
  ) => {
    if (isElevatorRunning || elevatorSolved) return;
    setElevatorProgram((current) =>
      updateElevatorBlocks(current, id, (block) => ({ ...block, ...patch })),
    );
  };

  const deleteElevatorInstruction = (id: string) => {
    if (isElevatorRunning || elevatorSolved) return;
    setElevatorProgram((current) => removeElevatorBlock(current, id).blocks);
    setSelectedElevatorLoopId(null);
    setElevatorFeedback(INITIAL_ELEVATOR_FEEDBACK);
  };

  const moveElevatorInstruction = (id: string, offset: -1 | 1) => {
    if (isElevatorRunning || elevatorSolved) return;
    setElevatorProgram(
      (current) => moveElevatorBlock(current, id, offset).blocks,
    );
  };

  const pressElevatorFloor = (requestedFloor: number) => {
    if (isElevatorRunning || elevatorSolved) return;
    if (requestedFloor === elevatorFloor) return;
    if (
      elevatorRequests.includes(requestedFloor) ||
      elevatorServed.includes(requestedFloor)
    )
      return;
    setElevatorRequests((current) =>
      current.includes(requestedFloor) ? current : [...current, requestedFloor],
    );
    setElevatorFeedback(INITIAL_ELEVATOR_FEEDBACK);
  };

  const callElevator = () => {
    if (isElevatorRunning || elevatorSolved || elevatorCallPending) return;
    setElevatorCallPending(true);
    setElevatorFeedback(INITIAL_ELEVATOR_FEEDBACK);
  };

  const executeElevatorProgram = () => {
    if (isElevatorRunning || elevatorSolved) return;

    const initialRequests = Array.from(
      new Set([...elevatorRequests, ...elevatorServed]),
    );
    const steps = expandElevatorProgram(elevatorProgram);

    const currentRun = elevatorRunId.current + 1;
    elevatorRunId.current = currentRun;
    stopElevatorTimer();
    setIsElevatorRunning(true);
    setElevatorFeedback({
      tone: 'neutral',
      message: 'Exécution du cycle en cours…',
    });

    let current: ElevatorRuntime = {
      floor: 0,
      doorsOpen: false,
      target: null,
      requests: [...initialRequests],
      served: [],
      motion: 'idle',
    };
    let cursor = 0;
    let openedByProgram = false;
    let closedByProgram = false;
    let pickupPending = elevatorCallPending;
    let autoCloseAt: number | null = null;

    const publishElevator = (runtime: ElevatorRuntime) => {
      setElevatorFloor(runtime.floor);
      setElevatorDoorsOpen(runtime.doorsOpen);
      setElevatorTarget(runtime.target);
      setElevatorRequests(runtime.requests);
      setElevatorServed(runtime.served);
      setElevatorMotion(runtime.motion);
    };

    const finishElevator = (
      runtime: ElevatorRuntime,
      success: boolean,
      message: string,
    ) => {
      if (elevatorRunId.current !== currentRun) return;
      publishElevator(runtime);
      setIsElevatorRunning(false);
      setElevatorSolved(success);
      setElevatorFeedback({ tone: success ? 'success' : 'error', message });
      elevatorTimer.current = null;
    };

    const applyElevatorAction = (
      runtime: ElevatorRuntime,
      action: ElevatorActionKind,
    ): { next: ElevatorRuntime; error?: string } => {
      const next: ElevatorRuntime = {
        ...runtime,
        requests: [...runtime.requests],
        served: [...runtime.served],
      };

      if (action === 'none') return { next };

      if (action === 'choose-next') {
        if (next.target === null && next.requests.length > 0) {
          next.target = chooseElevatorTarget(next);
        }
        return { next };
      }

      if (action === 'open-doors') {
        if (next.doorsOpen) return { next };

        const isInitialArrival = pickupPending && next.floor === 0;
        const isDestinationArrival =
          next.target !== null &&
          next.target === next.floor &&
          next.requests.includes(next.floor);

        if (!isInitialArrival && !isDestinationArrival) {
          return {
            next,
            error: pickupPending
              ? 'Appelez l’ascenseur avant d’ouvrir les portes.'
              : 'Les portes ne peuvent s’ouvrir qu’à l’arrêt demandé.',
          };
        }

        next.doorsOpen = true;
        next.motion = 'idle';
        openedByProgram = true;

        if (isInitialArrival) {
          pickupPending = false;
          setElevatorCallPending(false);
          return { next };
        }

        next.requests = next.requests.filter(
          (requestedFloor) => requestedFloor !== next.floor,
        );
        next.served.push(next.floor);
        next.target = null;
        autoCloseAt = Date.now() + 4000;
        return { next };
      }

      if (action === 'close-doors') {
        next.doorsOpen = false;
        closedByProgram = true;
        autoCloseAt = null;
        return { next };
      }

      if (next.target === null || next.requests.length === 0) return { next };
      if (pickupPending)
        return {
          next,
          error: 'Les portes doivent s’ouvrir avant le départ.',
        };
      if (next.doorsOpen)
        return {
          next,
          error: 'Fermez les portes avant de déplacer l’ascenseur.',
        };

      if (action === 'move-up') {
        if (next.target <= next.floor) {
          return {
            next,
            error: 'MONTER est impossible pour la demande sélectionnée.',
          };
        }
        if (next.floor >= 7)
          return { next, error: 'L’ascenseur ne peut pas monter davantage.' };
        next.floor += 1;
        next.motion = 'up';
        return { next };
      }

      if (next.target >= next.floor) {
        return {
          next,
          error: 'DESCENDRE est impossible pour la demande sélectionnée.',
        };
      }
      if (next.floor <= 0)
        return { next, error: 'L’ascenseur ne peut pas descendre davantage.' };
      next.floor -= 1;
      next.motion = 'down';
      return { next };
    };

    const tickElevator = () => {
      if (elevatorRunId.current !== currentRun) return;

      if (autoCloseAt !== null) {
        const remaining = autoCloseAt - Date.now();
        if (remaining > 0) {
          elevatorTimer.current = window.setTimeout(
            tickElevator,
            Math.min(remaining, 330),
          );
          return;
        }

        autoCloseAt = null;
        current = { ...current, doorsOpen: false, motion: 'idle' };
        closedByProgram = true;
        publishElevator(current);
      }

      if (cursor >= steps.length) {
        const expectedOrder = [...initialRequests].sort((a, b) => a - b);
        const correctOrder =
          expectedOrder.length > 0 &&
          current.requests.length === 0 &&
          current.target === null &&
          current.served.length === expectedOrder.length &&
          current.served.every(
            (requestedFloor, index) => requestedFloor === expectedOrder[index],
          );

        if (correctOrder && openedByProgram && closedByProgram) {
          finishElevator(
            current,
            true,
            'Ascenseur opérationnel. En attente d’une nouvelle demande.',
          );
        } else if (current.requests.length > 0) {
          finishElevator(current, false, 'Il reste des étages à desservir.');
        } else if (!correctOrder) {
          finishElevator(
            current,
            false,
            'Les arrêts ne sont pas dans le bon ordre.',
          );
        } else {
          finishElevator(current, false, 'Le cycle des portes est incomplet.');
        }
        return;
      }

      const step = steps[cursor];
      const action =
        step.kind === 'if'
          ? evaluateElevatorCondition(current, step.condition)
            ? step.thenAction
            : step.elseAction
          : step.action;
      const result = applyElevatorAction(current, action);

      if (result.error) {
        finishElevator(current, false, result.error);
        return;
      }

      current = result.next;
      cursor += 1;
      publishElevator(current);
      elevatorTimer.current = window.setTimeout(tickElevator, 330);
    };

    publishElevator(current);
    tickElevator();
  };

  const executeProgram = () => {
    if (isRunning) return;

    const steps = expandProgram(program);

    const currentRun = runId.current + 1;
    runId.current = currentRun;
    stopTimer();
    setIsRunning(true);
    setFeedback({
      tone: 'neutral',
      message: 'Exécution du protocole en cours…',
    });
    const initialRobot = createInitialRobot(activeMaze);
    setRobot(initialRobot);

    let cursor = 0;
    let current: RobotState = initialRobot;

    const finish = (next: RobotState, success: boolean, message: string) => {
      if (runId.current !== currentRun) return;
      setRobot(next);
      setIsRunning(false);
      setFeedback({ tone: success ? 'success' : 'error', message });
      runTimer.current = null;
      if (success) {
        setScreen('stage3');
        setBinaryFeedback({
          tone: 'neutral',
          message: 'Reconstituez les deux lettres, puis validez votre lecture.',
        });
      }
    };

    const tick = () => {
      if (runId.current !== currentRun) return;

      if (cursor >= steps.length) {
        const isAtDoor =
          current.row === activeMaze.door.row &&
          current.col === activeMaze.door.col;
        const hasCorrectRoute = activeMaze.targetOrder.every(
          (item, index) => current.collected[index] === item,
        );
        const stayedOnSolution = current.visited.every((cellId) =>
          activeMaze.route.includes(cellId),
        );

        if (
          isAtDoor &&
          hasCorrectRoute &&
          current.collected.length === activeMaze.targetOrder.length &&
          stayedOnSolution
        ) {
          if (!current.collected.includes('key')) {
            finish(current, false, 'La porte est verrouillée sans la clé.');
          } else {
            finish(current, true, 'Trajet valide. Passage à l’épreuve 03…');
          }
        } else if (isAtDoor && !stayedOnSolution) {
          finish(current, false, 'Un cul-de-sac a été emprunté.');
        } else if (isAtDoor && !current.collected.includes('key')) {
          finish(current, false, 'La porte est verrouillée sans la clé.');
        } else if (isAtDoor) {
          finish(current, false, 'La clé doit être récupérée avant la sortie.');
        } else {
          finish(current, false, 'Le robot n’a pas atteint la sortie.');
        }
        return;
      }

      const next: RobotState = {
        ...current,
        collected: [...current.collected],
        visited: [...current.visited],
        steps: current.steps + 1,
      };

      const step = steps[cursor];
      let command: ActionKind;
      if (step.kind === 'if') {
        const conditionMet = evaluateCondition(
          current,
          activeMaze,
          step.condition,
        );
        command = conditionMet ? step.thenCommand : step.elseCommand;
      } else {
        command = step.command;
      }

      if (command === 'none') {
        current = next;
        cursor += 1;
        setRobot(next);
        runTimer.current = window.setTimeout(tick, 380);
        return;
      }

      if (command === 'left') {
        next.direction = ((next.direction + 3) % 4) as Direction;
      } else if (command === 'right') {
        next.direction = ((next.direction + 1) % 4) as Direction;
      } else {
        const [rowDelta, colDelta] = getDirectionDelta(next.direction);
        const nextRow = next.row + rowDelta;
        const nextCol = next.col + colDelta;
        const isOutside =
          nextRow < 0 ||
          nextRow >= GRID_SIZE ||
          nextCol < 0 ||
          nextCol >= GRID_SIZE;

        if (isOutside) {
          finish(current, false, 'Collision : le robot sort de la grille.');
          return;
        }

        const nextCell = getCell(activeMaze, nextRow, nextCol);
        if (nextCell.kind === 'wall') {
          finish(current, false, 'Collision : le robot rencontre un mur.');
          return;
        }

        if (nextCell.kind === 'door' && !next.collected.includes('key')) {
          finish(current, false, 'La porte est verrouillée sans la clé.');
          return;
        }

        next.row = nextRow;
        next.col = nextCol;
        const nextCellId = createCellId(nextRow, nextCol);
        if (!next.visited.includes(nextCellId)) next.visited.push(nextCellId);
        if (
          nextCell.kind === 'item' &&
          nextCell.value &&
          !next.collected.includes(nextCell.value)
        ) {
          next.collected.push(nextCell.value);
        }

        if (nextCell.kind === 'door' && cursor < steps.length - 1) {
          finish(
            next,
            false,
            'La sortie est atteinte avant la fin du programme.',
          );
          return;
        }
      }

      current = next;
      cursor += 1;
      setRobot(next);
      runTimer.current = window.setTimeout(tick, 380);
    };

    tick();
  };

  const handleBinaryAnswerChange = (value: string) => {
    setBinaryAnswer(value.replace(/\D/g, '').slice(0, 4));
    if (binaryFeedback.tone === 'error')
      setBinaryFeedback(INITIAL_BINARY_FEEDBACK);
  };

  const selectEnergySource = (sourceId: string) => {
    if (
      energySolved ||
      !ENERGY_SOURCES.some((source) => source.id === sourceId)
    )
      return;
    setSelectedEnergyId((current) => (current === sourceId ? null : sourceId));
  };

  const assignEnergySource = (sourceId: string, category: EnergyCategory) => {
    if (energySolved) return;
    const source = ENERGY_SOURCES.find(
      (candidate) => candidate.id === sourceId,
    );
    if (!source) return;

    const nextAssignments = { ...energyAssignments, [sourceId]: category };
    setEnergyAssignments(nextAssignments);
    setSelectedEnergyId(null);

    if (Object.keys(nextAssignments).length === ENERGY_SOURCES.length) {
      const isCorrect = ENERGY_SOURCES.every(
        (candidate) => nextAssignments[candidate.id] === candidate.category,
      );
      setEnergySolved(isCorrect);
      setEnergyFeedback(
        isCorrect
          ? { tone: 'success', message: 'Classement correct.' }
          : { tone: 'error', message: 'Certaines cartes sont mal classées.' },
      );
      if (isCorrect) {
        resetElevatorChallenge();
        setScreen('stage5');
      }
      return;
    }

    setEnergyFeedback(INITIAL_ENERGY_FEEDBACK);
  };

  const returnEnergySource = (sourceId: string) => {
    if (energySolved || !energyAssignments[sourceId]) return;
    const nextAssignments = { ...energyAssignments };
    delete nextAssignments[sourceId];
    setEnergyAssignments(nextAssignments);
    setSelectedEnergyId(null);
    setEnergyFeedback(INITIAL_ENERGY_FEEDBACK);
  };

  const handleEnergyDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const payload = event.dataTransfer.getData('text/plain');
    if (payload.startsWith('energy:')) {
      returnEnergySource(payload.replace('energy:', ''));
    }
  };

  const handleEnergyDragStart = (
    event: React.DragEvent<HTMLButtonElement>,
    sourceId: string,
  ) => {
    event.dataTransfer.setData('text/plain', `energy:${sourceId}`);
    event.dataTransfer.effectAllowed = 'move';
    setSelectedEnergyId(sourceId);
  };

  const handleEnergyDragEnd = () => {
    setSelectedEnergyId(null);
  };

  const validateBinaryAnswer = () => {
    if (binarySolved) return;

    if (binaryAnswer.length !== 4) {
      setBinaryFeedback({
        tone: 'error',
        message: 'Saisissez les quatre chiffres du code.',
      });
      return;
    }

    if (binaryAnswer === activeBinaryVariant.answer) {
      setBinarySolved(true);
      setBinaryFeedback({ tone: 'success', message: 'Réponse correcte.' });
      setEnergyFeedback(INITIAL_ENERGY_FEEDBACK);
      setScreen('stage4');
      return;
    }

    setBinaryFeedback({
      tone: 'error',
      message: 'Réponse incorrecte. Relisez les huit lignes.',
    });
  };

  if (['challenge', 'stage5'].includes(screen)) {
    return (
      <main className="stalk-shell scratch-page">
        <ScratchChallenge
          key={screen}
          mode={screen === 'challenge' ? 'maze' : 'elevator'}
          onComplete={
            screen === 'challenge' ? () => setScreen('stage3') : undefined
          }
          panel={
            screen === 'challenge' ? ScratchMazePanel : ScratchElevatorPanel
          }
        />
      </main>
    );
  }

  return (
    <main className="stalk-shell">
      <div className="main-content">
        {screen === 'access' && (
          <AccessScreen
            accessCode={accessCode}
            accessError={accessError}
            onChange={(value) => {
              setAccessCode(value.replace(/\D/g, '').slice(0, 4));
              if (accessError) setAccessError('');
            }}
            onSubmit={handleAccessSubmit}
          />
        )}
        {screen === 'teacher' && (
          <TeacherBypassScreen onSelectStage={openTeacherStage} />
        )}
        {screen === 'challenge' && (
          <ChallengeScreen
            maze={activeMaze}
            robot={robot}
            program={program}
            feedback={feedback}
            isRunning={isRunning}
            onAdd={addInstruction}
            onChange={updateInstruction}
            onDelete={deleteInstruction}
            onMove={moveInstruction}
            onDrop={handleProgramDrop}
            onDragStart={handleBlockDragStart}
            onExecute={executeProgram}
            onReset={resetChallenge}
          />
        )}
        {screen === 'stage3' && (
          <BinaryChallengeScreen
            variant={activeBinaryVariant}
            answer={binaryAnswer}
            feedback={binaryFeedback}
            solved={binarySolved}
            onChange={handleBinaryAnswerChange}
            onSubmit={validateBinaryAnswer}
          />
        )}
        {screen === 'stage4' && (
          <EnergyChallengeScreen
            assignments={energyAssignments}
            selectedEnergyId={selectedEnergyId}
            feedback={energyFeedback}
            solved={energySolved}
            onSelect={selectEnergySource}
            onAssign={assignEnergySource}
            onReturn={returnEnergySource}
            onDrop={handleEnergyDrop}
            onDragStart={handleEnergyDragStart}
            onDragEnd={handleEnergyDragEnd}
          />
        )}
        {screen === 'stage5' && (
          <ElevatorChallengeScreen
            program={elevatorProgram}
            selectedLoopId={selectedElevatorLoopId}
            floor={elevatorFloor}
            doorsOpen={elevatorDoorsOpen}
            target={elevatorTarget}
            requests={elevatorRequests}
            served={elevatorServed}
            motion={elevatorMotion}
            callPending={elevatorCallPending}
            feedback={elevatorFeedback}
            solved={elevatorSolved}
            isRunning={isElevatorRunning}
            onAdd={addElevatorInstruction}
            onSelectLoop={selectElevatorLoop}
            onChange={updateElevatorInstruction}
            onDelete={deleteElevatorInstruction}
            onMove={moveElevatorInstruction}
            onExecute={executeElevatorProgram}
            onReset={resetElevatorChallenge}
            onCallElevator={callElevator}
            onFloorPress={pressElevatorFloor}
          />
        )}
      </div>
    </main>
  );
}
