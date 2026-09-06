import { ElevatorSimulation, MazeSimulation } from './simulation.mjs';

export class LabExtension {
  constructor(vm, mode, onChange = () => {}) {
    this.vm = vm;
    this.mode = mode;
    this.id = mode === 'maze' ? 'stalkmaze' : 'stalkelevator';
    this.simulation =
      mode === 'maze' ? new MazeSimulation() : new ElevatorSimulation();
    this.onChange = onChange;
    this.timers = new Map();
    this.busy = false;
    this.motion = 'idle';
    vm.runtime.on('PROJECT_STOP_ALL', () => this.cancel());
    // Scratch emits this after stopping old threads, before running flag hats.
    vm.runtime.on('PROJECT_START', () => this.reset());
  }

  getInfo() {
    const command = (opcode, text) => ({ opcode, text, blockType: 'command' });
    const boolean = (opcode, text) => ({ opcode, text, blockType: 'Boolean' });
    const reporter = (opcode, text) => ({
      opcode,
      text,
      blockType: 'reporter',
    });
    const event = (opcode, text) => ({
      opcode,
      text,
      blockType: 'event',
      isEdgeActivated: false,
    });
    const blocks =
      this.mode === 'maze'
        ? [
            command('advance', 'avancer d’une case'),
            command('left', 'tourner à gauche'),
            command('right', 'tourner à droite'),
            command('collectKey', 'ramasser la clé'),
            boolean('onKey', 'sur la case de la clé ?'),
            boolean('hasKey', 'clé récupérée ?'),
            boolean('wallAhead', 'mur devant ?'),
            boolean('atExit', 'sortie atteinte ?'),
            command('reset', 'replacer le robot au départ'),
          ]
        : [
            event('whenCalled', 'quand l’ascenseur est appelé'),
            event('whenDestination', 'quand un étage est choisi'),
            command('choose', 'choisir le prochain arrêt'),
            command('open', 'ouvrir les portes'),
            command('close', 'fermer les portes'),
            command('up', 'monter d’un étage'),
            command('down', 'descendre d’un étage'),
            boolean('hasRequests', 'une demande en attente ?'),
            boolean('requestAbove', 'prochain arrêt au-dessus ?'),
            boolean('requestBelow', 'prochain arrêt en dessous ?'),
            boolean('requestHere', 'demande à cet étage ?'),
            boolean('doorsOpen', 'portes ouvertes ?'),
            reporter('floor', 'étage actuel'),
            reporter('target', 'prochain arrêt'),
            reporter('calls', 'appels extérieurs'),
            reporter('destinations', 'destinations choisies'),
            command('reset', 'réinitialiser l’ascenseur'),
            {
              opcode: 'call',
              text: 'appeler depuis l’étage [FLOOR]',
              blockType: 'command',
              arguments: { FLOOR: { type: 'number', defaultValue: 0 } },
            },
            {
              opcode: 'destination',
              text: 'appuyer sur l’étage [FLOOR]',
              blockType: 'command',
              arguments: { FLOOR: { type: 'number', defaultValue: 3 } },
            },
          ];
    return {
      id: this.id,
      name: this.mode === 'maze' ? 'Labyrinthe' : 'Ascenseur',
      color1: '#5968b0',
      color2: '#455393',
      color3: '#334072',
      blocks,
    };
  }

  cancel() {
    for (const [timer, resolve] of this.timers) {
      clearTimeout(timer);
      resolve();
    }
    this.timers.clear();
    this.busy = false;
    this.motion = 'idle';
    this.publish();
  }

  async action(operation, util, delay = 380, motion = 'idle') {
    if (this.busy) {
      this.simulation.state.error =
        'Deux commandes de mouvement sont lancées en même temps.';
      this.publish();
      util?.stopThisScript();
      return;
    }
    const error = operation();
    if (error) {
      this.simulation.state.error = error;
      this.publish();
      util?.stopThisScript();
      return;
    }
    this.busy = true;
    this.motion = motion;
    this.publish();
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        this.busy = false;
        this.motion = 'idle';
        this.publish();
        resolve();
      }, delay);
      this.timers.set(timer, resolve);
    });
  }

  reset() {
    this.cancel();
    this.simulation.reset();
    this.publish();
  }
  advance(_args, util) {
    return this.action(() => this.simulation.move(), util);
  }
  left(_args, util) {
    return this.action(() => this.simulation.turn(-1), util, 160);
  }
  right(_args, util) {
    return this.action(() => this.simulation.turn(1), util, 160);
  }
  collectKey(_args, util) {
    return this.action(() => this.simulation.collectKey(), util, 220);
  }
  onKey() {
    return this.simulation.onKey();
  }
  hasKey() {
    return this.simulation.state.hasKey;
  }
  wallAhead() {
    return this.simulation.wallAhead();
  }
  atExit() {
    return this.simulation.state.completed;
  }
  choose() {
    this.simulation.choose();
    this.publish();
  }
  open(_args, util) {
    return this.action(() => this.simulation.open(), util, 520);
  }
  close(_args, util) {
    return this.action(() => this.simulation.close(), util, 520);
  }
  up(_args, util) {
    return this.action(() => this.simulation.move(1), util, 500, 'up');
  }
  down(_args, util) {
    return this.action(() => this.simulation.move(-1), util, 500, 'down');
  }
  hasRequests() {
    return this.simulation.pending().length > 0;
  }
  requestAbove() {
    const target = this.simulation.nextFloor();
    return target !== null && target > this.floor();
  }
  requestBelow() {
    const target = this.simulation.nextFloor();
    return target !== null && target < this.floor();
  }
  requestHere() {
    return this.simulation.pending().includes(this.floor());
  }
  doorsOpen() {
    return this.simulation.state.doorsOpen;
  }
  floor() {
    return this.simulation.state.floor;
  }
  target() {
    return this.simulation.state.target ?? '';
  }
  calls() {
    return this.simulation.state.calls.join(', ');
  }
  destinations() {
    return this.simulation.state.destinations.join(', ');
  }
  call({ FLOOR }) {
    this.request('calls', FLOOR, 'whenCalled');
  }
  destination({ FLOOR }) {
    this.request('destinations', FLOOR, 'whenDestination');
  }

  request(kind, floor, event) {
    if (this.simulation.request(kind, floor)) {
      this.publish();
      this.vm.runtime.startHats(`${this.id}_${event}`);
    }
  }

  publish() {
    const stage = this.vm.runtime.getTargetForStage();
    const setVariable = (name, value) => {
      const variable = stage?.lookupVariableByNameAndType(name, '');
      if (variable) variable.value = value;
    };
    const sprite = (name) =>
      this.vm.runtime.targets.find((target) => target.getName() === name);
    const state = this.simulation.state;
    setVariable('Message', state.error);
    if (this.mode === 'maze') {
      sprite('Robot')?.setXY(-144 + state.col * 24, 144 - state.row * 24);
      sprite('Robot')?.setDirection([0, 90, 180, -90][state.direction]);
      sprite('Clé')?.setVisible(!state.hasKey);
      setVariable('Clé récupérée', state.hasKey ? 'oui' : 'non');
    } else {
      const y = -122 + state.floor * 34;
      sprite('Cabine')?.setXY(-151, y);
      sprite('Porte gauche')?.setXY(-158 - (state.doorsOpen ? 11 : 0), y);
      sprite('Porte droite')?.setXY(-144 + (state.doorsOpen ? 11 : 0), y);
      setVariable('Étage', state.floor);
      setVariable('Portes', state.doorsOpen ? 'ouvertes' : 'fermées');
      setVariable('Appels', state.calls.join(' · '));
      setVariable('Destinations', state.destinations.join(' · '));
      setVariable('Arrêts', state.served.slice(-12).join(' → '));
      for (let floor = 0; floor <= 7; floor++) {
        sprite(`Appel ${floor}`)?.setCostume(
          state.calls.includes(floor) ? 1 : 0,
        );
        sprite(`Étage ${floor}`)?.setCostume(
          state.destinations.includes(floor) ? 1 : 0,
        );
      }
    }
    this.vm.runtime.requestRedraw();
    this.onChange(state);
  }
}
