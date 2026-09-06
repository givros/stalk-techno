import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import {
  ElevatorSimulation,
  MazeSimulation,
} from '../public/scratch/simulation.mjs';
import { LabExtension } from '../public/scratch/lab-extension.mjs';
import { createLocalAsset } from '../public/scratch/local-assets.mjs';
import { createLabBridge } from '../public/scratch/bridge.mjs';
import { createHash } from 'node:crypto';

const requireScratch = createRequire(
  new URL('../scratch/package.json', import.meta.url),
);
// The published Node bundle misses jsdom's stylesheet. Run the same official
// VM source instead, with its own installed dependencies; no runtime mocks.
const VirtualMachine = requireScratch(
  path.resolve(
    path.dirname(requireScratch.resolve('@scratch/scratch-vm')),
    '../../src/index.js',
  ),
);
const { ScratchStorage, AssetType, DataFormat } = requireScratch(
  '@scratch/scratch-storage',
);
const emptyImage =
  '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"></svg>';
const imageId = createHash('md5').update(emptyImage).digest('hex');

function block(opcode, next = null, inputs = {}, fields = {}, parent = null) {
  return {
    opcode,
    next,
    inputs,
    fields,
    parent,
    shadow: false,
    topLevel: parent === null,
    ...(parent === null ? { x: 40, y: 40 } : {}),
  };
}

function project(blocks, extensions = []) {
  return {
    targets: [
      {
        isStage: true,
        name: 'Stage',
        variables: { count: ['count', 0] },
        lists: {},
        broadcasts: {},
        blocks,
        costumes: [
          {
            name: 'Backdrop',
            assetId: imageId,
            md5ext: `${imageId}.svg`,
            dataFormat: 'svg',
            bitmapResolution: 1,
            rotationCenterX: 240,
            rotationCenterY: 180,
          },
        ],
        currentCostume: 0,
        sounds: [],
        comments: {},
        volume: 100,
        layerOrder: 0,
        tempo: 60,
        videoState: 'off',
        videoTransparency: 50,
      },
    ],
    monitors: [],
    extensions,
    meta: { semver: '3.0.0', vm: '15.1.1', agent: 'Local test' },
  };
}

async function createVm(context, mode) {
  const vm = new VirtualMachine();
  const storage = new ScratchStorage();
  createLocalAsset(
    storage,
    AssetType.ImageVector,
    DataFormat.SVG,
    new TextEncoder().encode(emptyImage),
  );
  vm.attachStorage(storage);
  const extension = mode ? new LabExtension(vm, mode) : null;
  if (extension) {
    const service = vm.extensionManager._registerInternalExtension(extension);
    vm.extensionManager._loadedExtensions.set(extension.id, service);
  }
  context.after(() => {
    vm.stopAll();
    vm.quit();
  });
  await delay(0);
  vm.start();
  return { vm, extension };
}

async function waitFor(predicate, timeout = 8000) {
  const start = Date.now();
  while (!predicate()) {
    assert.ok(
      Date.now() - start < timeout,
      'Scratch did not reach the expected state',
    );
    await delay(20);
  }
}

function panelBridge(context, extension, mode, ready = () => true) {
  const messages = [];
  let listener;
  const parent = {
    postMessage: (message, origin) => {
      assert.equal(origin, 'http://localhost:3000');
      messages.push(structuredClone(message));
    },
  };
  const host = {
    parent,
    location: { origin: 'http://localhost:3000' },
    addEventListener: (_type, callback) => {
      listener = callback;
    },
    removeEventListener: (_type, callback) => {
      if (listener === callback) listener = null;
    },
  };
  const bridge = createLabBridge(host, mode, () => extension, ready);
  extension.onChange = bridge.publishState;
  context.after(bridge.dispose);
  return {
    messages,
    send: (data, overrides = {}) =>
      listener?.({
        origin: host.location.origin,
        source: parent,
        data: { source: 'stalk-site', mode, ...data },
        ...overrides,
      }),
  };
}

test('the site panel only accepts same-origin physical buttons after Scratch is ready', async (context) => {
  const { vm, extension } = await createVm(context, 'elevator');
  await vm.loadProject(project({}, ['stalkelevator']));
  let ready = false;
  const panel = panelBridge(context, extension, 'elevator', () => ready);
  panel.send({ type: 'call', floor: 0 });
  assert.deepEqual(extension.simulation.pending(), []);
  ready = true;
  panel.send(
    { type: 'call', floor: 0 },
    { origin: 'https://untrusted.example' },
  );
  panel.send({ type: 'call', floor: 0 }, { source: {} });
  panel.send({ type: 'call', floor: 0, mode: 'maze' });
  panel.send({ type: 'open' });
  for (const floor of [-1, 8, 1.5, '3', null]) {
    panel.send({ type: 'destination', floor });
  }
  assert.deepEqual(extension.simulation.pending(), []);
  assert.equal(extension.simulation.state.doorsOpen, false);
  panel.send({ type: 'call', floor: 0 });
  [7, 3, 5].forEach((floor) => panel.send({ type: 'destination', floor }));
  assert.deepEqual(extension.simulation.state.calls, [0]);
  assert.deepEqual(extension.simulation.state.destinations, [7, 3, 5]);
  panel.send({ type: 'sync' });
  assert.equal(panel.messages.at(-1).ready, true);
  assert.deepEqual(panel.messages.at(-1).state.destinations, [7, 3, 5]);
});

test('the external call button triggers the real Scratch event and updates the door panel', async (context) => {
  const { vm, extension } = await createVm(context, 'elevator');
  await vm.loadProject(
    project(
      {
        call: block('stalkelevator_whenCalled', 'open'),
        open: block('stalkelevator_open', null, {}, {}, 'call'),
      },
      ['stalkelevator'],
    ),
  );
  const panel = panelBridge(context, extension, 'elevator');
  panel.send({ type: 'call', floor: 0 });
  await waitFor(() =>
    panel.messages.some((message) => message.state.doorsOpen),
  );
  assert.equal(extension.simulation.state.doorsOpen, true);
  assert.deepEqual(panel.messages.at(-1).state.calls, []);
});

test('Scratch movement and stop are reflected by the external elevator panel', async (context) => {
  const { vm, extension } = await createVm(context, 'elevator');
  await vm.loadProject(
    project(
      {
        flag: block('event_whenflagclicked', 'up'),
        up: block('stalkelevator_up', null, {}, {}, 'flag'),
      },
      ['stalkelevator'],
    ),
  );
  const panel = panelBridge(context, extension, 'elevator');
  vm.greenFlag();
  await waitFor(() =>
    panel.messages.some((message) => message.state.motion === 'up'),
  );
  assert.equal(panel.messages.at(-1).state.floor, 1);
  vm.stopAll();
  assert.equal(panel.messages.at(-1).state.motion, 'idle');
  assert.equal(panel.messages.at(-1).state.floor, 1);
});

test('the external maze panel receives robot position, key and completion state', async (context) => {
  const { vm, extension } = await createVm(context, 'maze');
  await vm.loadProject(project({}, ['stalkmaze']));
  const panel = panelBridge(context, extension, 'maze');
  panel.send({ type: 'sync' });
  assert.equal(panel.messages.at(-1).state.col, 1);
  extension.simulation.state.row = 2;
  extension.simulation.state.col = 9;
  await extension.advance();
  assert.equal(panel.messages.at(-1).state.col, 10);
  assert.equal(panel.messages.at(-1).state.hasKey, false);
  assert.equal(extension.onKey(), true);
  await extension.collectKey();
  assert.equal(panel.messages.at(-1).state.hasKey, true);
  assert.equal(extension.onKey(), false);
  extension.simulation.state.row = 10;
  extension.simulation.state.col = 9;
  await extension.advance();
  assert.equal(panel.messages.at(-1).state.completed, true);
});

test('elevator starts with closed doors; the current-floor cabin button is a no-op', () => {
  const elevator = new ElevatorSimulation();
  assert.equal(elevator.state.doorsOpen, false);
  assert.equal(elevator.request('destinations', 0), false);
  elevator.state.floor = 1;
  assert.equal(elevator.request('destinations', 1), false);
  assert.deepEqual(elevator.pending(), []);
});

test('hall calls and cabin requests are separate and duplicates are ignored', () => {
  const elevator = new ElevatorSimulation();
  assert.equal(elevator.request('calls', 0), true);
  assert.equal(elevator.request('calls', 0), false);
  assert.equal(elevator.request('destinations', 3), true);
  elevator.open();
  assert.deepEqual(elevator.state.calls, []);
  assert.deepEqual(elevator.state.destinations, [3]);
  assert.equal(elevator.request('calls', 0), false);
  for (const invalid of [-1, 8, 2.5, 'bad'])
    assert.equal(elevator.request('calls', invalid), false);
});

test('requests 7, 3, 5 from floor 0 are served in order 3, 5, 7', () => {
  const elevator = new ElevatorSimulation();
  [7, 3, 5].forEach((floor) => elevator.request('destinations', floor));
  while (elevator.pending().length) {
    elevator.choose();
    const target = elevator.state.target;
    while (elevator.state.floor !== target) {
      assert.equal(
        elevator.move(Math.sign(target - elevator.state.floor)),
        null,
      );
    }
    elevator.open();
    elevator.close();
  }
  assert.deepEqual(elevator.state.served, [3, 5, 7]);
});

test('descending requests are served before reversing direction', () => {
  const elevator = new ElevatorSimulation();
  elevator.state.floor = 6;
  elevator.state.heading = -1;
  [1, 7, 4].forEach((floor) => elevator.request('calls', floor));
  assert.equal(elevator.nextFloor(), 4);
  elevator.state.floor = 4;
  elevator.open();
  assert.equal(elevator.nextFloor(), 1);
  elevator.state.floor = 1;
  elevator.open();
  assert.equal(elevator.nextFloor(), 7);
});

test('doors open without a selected destination; movement has only physical safeguards', () => {
  const elevator = new ElevatorSimulation();
  elevator.open();
  assert.equal(elevator.state.doorsOpen, true);
  assert.match(elevator.move(1), /portes/);
  assert.equal(elevator.state.floor, 0);
  elevator.close();
  assert.equal(elevator.move(1), null);
  assert.equal(elevator.state.floor, 1);
  elevator.state.floor = 7;
  assert.match(elevator.move(1), /Limite/);
});

test('the maze can run a single block, but the door requires the key', () => {
  const maze = new MazeSimulation();
  assert.equal(maze.move(), null);
  assert.equal(maze.state.col, 2);
  maze.state.row = 10;
  maze.state.col = 9;
  assert.match(maze.move(), /clé/);
  assert.equal(maze.state.completed, false);
  maze.state.hasKey = true;
  assert.equal(maze.move(), null);
  assert.equal(maze.state.completed, true);
});

test('both branches connect: retrieve the key, return, and reach the door', () => {
  const maze = new MazeSimulation();
  const walk = (count) => {
    for (let n = 0; n < count; n++) assert.equal(maze.move(), null);
  };
  walk(5);
  maze.turn(-1);
  walk(4);
  maze.turn(1);
  walk(4);
  assert.equal(maze.state.hasKey, false);
  assert.equal(maze.onKey(), true);
  assert.equal(maze.collectKey(), null);
  assert.equal(maze.state.hasKey, true);
  maze.turn(1);
  maze.turn(1);
  walk(4);
  maze.turn(-1);
  walk(8);
  maze.turn(-1);
  walk(4);
  assert.equal(maze.state.completed, true);
});

test('the key sensor detects an available key and pickup only works on its cell', () => {
  const maze = new MazeSimulation();
  assert.equal(maze.onKey(), false);
  assert.match(maze.collectKey(), /clé/);
  assert.equal(maze.state.hasKey, false);
  assert.equal(maze.state.completed, false);

  maze.state.row = 2;
  maze.state.col = 9;
  assert.equal(maze.onKey(), false);
  assert.equal(maze.move(), null);
  assert.equal(maze.onKey(), true);
  assert.equal(maze.state.hasKey, false);
  assert.equal(maze.collectKey(), null);
  assert.equal(maze.onKey(), false);
  assert.equal(maze.state.hasKey, true);
  assert.match(maze.collectKey(), /clé/);
  assert.equal(maze.state.completed, false);

  maze.reset();
  assert.equal(maze.state.hasKey, false);
  maze.state.row = 2;
  maze.state.col = 10;
  assert.equal(maze.onKey(), true);
});

test('visiting the key without picking it up leaves the exit locked', () => {
  const maze = new MazeSimulation();
  maze.state.row = 2;
  maze.state.col = 9;
  assert.equal(maze.move(), null);
  assert.equal(maze.onKey(), true);
  maze.turn(1);
  maze.turn(1);
  for (let step = 0; step < 4; step++) assert.equal(maze.move(), null);
  maze.turn(-1);
  for (let step = 0; step < 8; step++) assert.equal(maze.move(), null);
  maze.turn(-1);
  for (let step = 0; step < 3; step++) assert.equal(maze.move(), null);
  assert.equal(maze.onKey(), false);
  assert.equal(maze.state.hasKey, false);
  assert.match(maze.move(), /verrouillée/);
  assert.equal(maze.state.col, 9);
  assert.equal(maze.state.completed, false);
});

test('Scratch exposes separate key sensor and pickup blocks', async (context) => {
  const { extension } = await createVm(context, 'maze');
  const { blocks } = extension.getInfo();
  assert.equal(new Set(blocks.map(({ opcode }) => opcode)).size, blocks.length);
  assert.deepEqual(
    blocks.find(({ opcode }) => opcode === 'onKey'),
    {
      opcode: 'onKey',
      text: 'sur la case de la clé ?',
      blockType: 'Boolean',
    },
  );
  assert.deepEqual(
    blocks.find(({ opcode }) => opcode === 'collectKey'),
    {
      opcode: 'collectKey',
      text: 'ramasser la clé',
      blockType: 'command',
    },
  );
});

test('a native Scratch IF skips pickup away from the key and keeps running', async (context) => {
  const { vm, extension } = await createVm(context, 'maze');
  await vm.loadProject(
    project(
      {
        flag: block('event_whenflagclicked', 'if'),
        if: block(
          'control_if',
          'move',
          { CONDITION: [2, 'onKey'], SUBSTACK: [2, 'collect'] },
          {},
          'flag',
        ),
        onKey: block('stalkmaze_onKey', null, {}, {}, 'if'),
        collect: block('stalkmaze_collectKey', null, {}, {}, 'if'),
        move: block('stalkmaze_advance', null, {}, {}, 'if'),
      },
      ['stalkmaze'],
    ),
  );
  vm.greenFlag();
  await waitFor(() => extension.simulation.state.col === 2 && !extension.busy);
  assert.equal(extension.simulation.state.hasKey, false);
  assert.equal(extension.simulation.state.error, '');
});

test('unguarded pickup executes and reports a runtime error only when no key is present', async (context) => {
  const { vm, extension } = await createVm(context, 'maze');
  await vm.loadProject(
    project(
      {
        flag: block('event_whenflagclicked', 'collect'),
        collect: block('stalkmaze_collectKey', 'move', {}, {}, 'flag'),
        move: block('stalkmaze_advance', null, {}, {}, 'collect'),
      },
      ['stalkmaze'],
    ),
  );
  vm.greenFlag();
  await waitFor(() => extension.simulation.state.error !== '');
  assert.match(extension.simulation.state.error, /clé sur cette case/);
  await delay(100);
  assert.equal(extension.simulation.state.col, 1);
  assert.equal(extension.simulation.state.hasKey, false);
  assert.equal(extension.simulation.state.completed, false);
});

test('native Scratch repeats and IF collect the key, unlock the exit and survive SB3 export', async (context) => {
  const { vm, extension } = await createVm(context, 'maze');
  const route = [
    ['approach', 'control_repeat', 5],
    ['north', 'stalkmaze_left'],
    ['upperBranch', 'control_repeat', 4],
    ['east', 'stalkmaze_right'],
    ['keyLane', 'control_repeat', 4],
    ['turnBack1', 'stalkmaze_right'],
    ['turnBack2', 'stalkmaze_right'],
    ['returnLane', 'control_repeat', 4],
    ['south', 'stalkmaze_left'],
    ['lowerBranch', 'control_repeat', 8],
    ['exitTurn', 'stalkmaze_left'],
    ['exitLane', 'control_repeat', 4],
  ];
  const blocks = { flag: block('event_whenflagclicked', route[0][0]) };
  route.forEach(([id, opcode, times], index) => {
    blocks[id] = block(
      opcode,
      route[index + 1]?.[0] ?? null,
      times
        ? { TIMES: [1, [4, String(times)]], SUBSTACK: [2, `${id}Move`] }
        : {},
      {},
      route[index - 1]?.[0] ?? 'flag',
    );
    if (times) {
      blocks[`${id}Move`] = block(
        'stalkmaze_advance',
        id === 'keyLane' ? 'keyCheck' : null,
        {},
        {},
        id,
      );
    }
  });
  blocks.keyCheck = block(
    'control_if',
    null,
    { CONDITION: [2, 'onKey'], SUBSTACK: [2, 'collect'] },
    {},
    'keyLaneMove',
  );
  blocks.onKey = block('stalkmaze_onKey', null, {}, {}, 'keyCheck');
  blocks.collect = block('stalkmaze_collectKey', null, {}, {}, 'keyCheck');
  await vm.loadProject(project(blocks, ['stalkmaze']));
  const panel = panelBridge(context, extension, 'maze');
  vm.greenFlag();
  await waitFor(
    () =>
      extension.simulation.state.completed || extension.simulation.state.error,
    25000,
  );
  assert.equal(extension.simulation.state.error, '');
  assert.equal(extension.simulation.state.completed, true);
  assert.equal(extension.simulation.state.hasKey, true);
  assert.ok(
    panel.messages.some(
      ({ state }) => state.row === 2 && state.col === 10 && !state.hasKey,
    ),
    'Reaching the key must not collect it before the IF runs',
  );
  assert.equal(panel.messages.at(-1).state.completed, true);

  vm.stopAll();
  const blob = await vm.saveProjectSb3();
  await vm.loadProject(await blob.arrayBuffer());
  const restored = vm.runtime.getTargetForStage().blocks;
  assert.equal(restored.getBlock('keyCheck').opcode, 'control_if');
  assert.equal(restored.getBlock('onKey').opcode, 'stalkmaze_onKey');
  assert.equal(restored.getBlock('collect').opcode, 'stalkmaze_collectKey');
});

test('official Scratch VM executes a nested repeat / if and round-trips SB3', async (context) => {
  const { vm } = await createVm(context);
  const blocks = {
    flag: block('event_whenflagclicked', 'repeat'),
    repeat: block(
      'control_repeat',
      null,
      { TIMES: [1, [4, '3']], SUBSTACK: [2, 'if'] },
      {},
      'flag',
    ),
    if: block(
      'control_if',
      null,
      { CONDITION: [2, 'test'], SUBSTACK: [2, 'change'] },
      {},
      'repeat',
    ),
    test: block(
      'operator_lt',
      null,
      {
        OPERAND1: [3, [12, 'count', 'count'], [4, '0']],
        OPERAND2: [1, [4, '2']],
      },
      {},
      'if',
    ),
    change: block(
      'data_changevariableby',
      null,
      { VALUE: [1, [4, '1']] },
      { VARIABLE: ['count', 'count'] },
      'if',
    ),
  };
  await vm.loadProject(project(blocks));
  vm.greenFlag();
  await waitFor(
    () => vm.runtime.getTargetForStage().variables.count.value === 2,
  );
  await delay(200);
  assert.equal(vm.runtime.getTargetForStage().variables.count.value, 2);
  const blob = await vm.saveProjectSb3();
  assert.ok(blob.size > 100);
  await vm.loadProject(await blob.arrayBuffer());
  assert.equal(vm.runtime.getTargetForStage().variables.count.value, 2);
  assert.equal(
    vm.runtime.getTargetForStage().blocks.getBlock('repeat').opcode,
    'control_repeat',
  );
});

test('official Scratch runs just one elevator block without any structural gate', async (context) => {
  const { vm, extension } = await createVm(context, 'elevator');
  await vm.loadProject(
    project(
      {
        flag: block('event_whenflagclicked', 'open'),
        open: block('stalkelevator_open', null, {}, {}, 'flag'),
      },
      ['stalkelevator'],
    ),
  );
  vm.greenFlag();
  await waitFor(() => extension.simulation.state.doorsOpen);
  assert.equal(extension.simulation.state.floor, 0);
  assert.equal(extension.simulation.state.error, '');
});

test('official Scratch hall event opens doors, waits four seconds and closes them', async (context) => {
  const { vm, extension } = await createVm(context, 'elevator');
  await vm.loadProject(
    project(
      {
        call: block('stalkelevator_whenCalled', 'open'),
        open: block('stalkelevator_open', 'wait', {}, {}, 'call'),
        wait: block(
          'control_wait',
          'close',
          { DURATION: [1, [4, '4']] },
          {},
          'open',
        ),
        close: block('stalkelevator_close', null, {}, {}, 'wait'),
      },
      ['stalkelevator'],
    ),
  );
  extension.call({ FLOOR: 0 });
  await waitFor(() => extension.simulation.state.doorsOpen);
  const openedAt = Date.now();
  await delay(3900);
  assert.equal(extension.simulation.state.doorsOpen, true);
  await waitFor(() => !extension.simulation.state.doorsOpen);
  assert.ok(Date.now() - openedAt >= 4000);
  assert.deepEqual(extension.simulation.state.served, [0]);
  await waitFor(() => !extension.busy);
  extension.call({ FLOOR: 0 });
  await waitFor(() => extension.simulation.state.doorsOpen);
});

test('Scratch stop cancels pending simulator actions; maze supports native repeat', async (context) => {
  const { vm, extension } = await createVm(context, 'maze');
  await vm.loadProject(
    project(
      {
        flag: block('event_whenflagclicked', 'repeat'),
        repeat: block(
          'control_repeat',
          null,
          { TIMES: [1, [4, '4']], SUBSTACK: [2, 'move'] },
          {},
          'flag',
        ),
        move: block('stalkmaze_advance', null, {}, {}, 'repeat'),
      },
      ['stalkmaze'],
    ),
  );
  vm.greenFlag();
  await waitFor(() => extension.simulation.state.col === 3);
  vm.stopAll();
  const stoppedAt = extension.simulation.state.col;
  await delay(550);
  assert.equal(extension.simulation.state.col, stoppedAt);
  assert.equal(extension.timers.size, 0);
  vm.greenFlag();
  await waitFor(() => extension.simulation.state.col === 5);
  assert.equal(extension.simulation.state.error, '');
});

test('green flag resets the maze, key and panel without clearing blocks or user variables', async (context) => {
  const { vm, extension } = await createVm(context, 'maze');
  await vm.loadProject(
    project(
      {
        flag: block('event_whenflagclicked'),
      },
      ['stalkmaze'],
    ),
  );
  const stage = vm.runtime.getTargetForStage();
  stage.variables.count.value = 42;
  const codeBefore = structuredClone(stage.blocks.getBlock('flag'));
  Object.assign(extension.simulation.state, {
    row: 2,
    col: 10,
    direction: 3,
    hasKey: true,
    completed: true,
    error: 'Previous run error',
  });
  const panel = panelBridge(context, extension, 'maze');

  vm.greenFlag();

  assert.deepEqual(extension.simulation.state, new MazeSimulation().state);
  assert.deepEqual(panel.messages.at(-1).state, {
    ...new MazeSimulation().state,
    motion: 'idle',
  });
  assert.deepEqual(stage.blocks.getBlock('flag'), codeBefore);
  assert.equal(stage.variables.count.value, 42);
});

test('green flag also resets an empty maze project', async (context) => {
  const { vm, extension } = await createVm(context, 'maze');
  await vm.loadProject(project({}, ['stalkmaze']));
  extension.simulation.state.col = 5;
  extension.simulation.state.hasKey = true;
  vm.greenFlag();
  assert.deepEqual(extension.simulation.state, new MazeSimulation().state);
});

test('pressing the flag again during a maze loop cancels the old run and starts at the entrance', async (context) => {
  const { vm, extension } = await createVm(context, 'maze');
  await vm.loadProject(
    project(
      {
        flag: block('event_whenflagclicked', 'repeat'),
        repeat: block(
          'control_repeat',
          null,
          {
            TIMES: [1, [4, '4']],
            SUBSTACK: [2, 'move'],
          },
          {},
          'flag',
        ),
        move: block('stalkmaze_advance', null, {}, {}, 'repeat'),
      },
      ['stalkmaze'],
    ),
  );
  vm.greenFlag();
  await waitFor(() => extension.simulation.state.col === 3);
  assert.equal(extension.busy, true);

  vm.greenFlag();

  assert.deepEqual(extension.simulation.state, new MazeSimulation().state);
  assert.equal(extension.timers.size, 0);
  assert.equal(extension.busy, false);
  await waitFor(() => extension.simulation.state.col === 5 && !extension.busy);
  await delay(450);
  assert.equal(extension.simulation.state.col, 5);
  assert.equal(extension.simulation.state.error, '');
  assert.equal(extension.timers.size, 0);
});

test('green flag resets the elevator before its first block, including on a rapid restart', async (context) => {
  const { vm, extension } = await createVm(context, 'elevator');
  await vm.loadProject(
    project(
      {
        flag: block('event_whenflagclicked', 'up'),
        up: block('stalkelevator_up', null, {}, {}, 'flag'),
      },
      ['stalkelevator'],
    ),
  );
  Object.assign(extension.simulation.state, {
    floor: 6,
    doorsOpen: true,
    target: 7,
    heading: -1,
    calls: [0, 7],
    destinations: [3],
    served: [2, 4],
    error: 'Previous run error',
  });
  const panel = panelBridge(context, extension, 'elevator');

  vm.greenFlag();

  assert.deepEqual(extension.simulation.state, new ElevatorSimulation().state);
  assert.equal(panel.messages.at(-1).state.floor, 0);
  assert.equal(panel.messages.at(-1).state.doorsOpen, false);
  await waitFor(() => extension.simulation.state.floor === 1);
  assert.equal(extension.busy, true);
  vm.greenFlag();
  assert.deepEqual(extension.simulation.state, new ElevatorSimulation().state);
  await waitFor(
    () => extension.simulation.state.floor === 1 && !extension.busy,
  );
  await delay(550);
  assert.equal(extension.simulation.state.floor, 1);
  assert.equal(extension.simulation.state.error, '');
  assert.equal(
    vm.runtime.getTargetForStage().blocks.getBlock('up').opcode,
    'stalkelevator_up',
  );
});

test('an elevator call starts its event without resetting the simulation', async (context) => {
  const { vm, extension } = await createVm(context, 'elevator');
  await vm.loadProject(
    project(
      {
        call: block('stalkelevator_whenCalled', 'open'),
        open: block('stalkelevator_open', null, {}, {}, 'call'),
      },
      ['stalkelevator'],
    ),
  );
  extension.simulation.state.floor = 4;
  extension.call({ FLOOR: 4 });
  await waitFor(() => extension.simulation.state.doorsOpen);
  assert.equal(extension.simulation.state.floor, 4);
  assert.deepEqual(extension.simulation.state.served, [4]);
});
