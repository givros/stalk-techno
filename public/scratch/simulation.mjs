export class ElevatorSimulation {
  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      floor: 0,
      doorsOpen: false,
      target: null,
      heading: 1,
      calls: [],
      destinations: [],
      served: [],
      error: '',
    };
  }

  request(kind, value) {
    if (!['calls', 'destinations'].includes(kind)) return false;
    const floor = Number(value);
    if (!Number.isInteger(floor) || floor < 0 || floor > 7) return false;
    if (
      floor === this.state.floor &&
      (kind === 'destinations' || this.state.doorsOpen)
    )
      return false;
    if (this.state[kind].includes(floor)) return false;
    this.state[kind].push(floor);
    this.state.error = '';
    return true;
  }

  pending() {
    return [...new Set([...this.state.calls, ...this.state.destinations])];
  }

  nextFloor() {
    const { floor, heading } = this.state;
    const requests = this.pending();
    if (requests.includes(floor)) return floor;
    const above = requests.filter((n) => n > floor).sort((a, b) => a - b);
    const below = requests.filter((n) => n < floor).sort((a, b) => b - a);
    return heading > 0
      ? (above[0] ?? below[0] ?? null)
      : (below[0] ?? above[0] ?? null);
  }

  choose() {
    this.state.target = this.nextFloor();
  }

  open() {
    this.state.doorsOpen = true;
    if (this.pending().includes(this.state.floor)) {
      this.state.served.push(this.state.floor);
      this.state.calls = this.state.calls.filter((n) => n !== this.state.floor);
      this.state.destinations = this.state.destinations.filter(
        (n) => n !== this.state.floor,
      );
    }
    if (this.state.target === this.state.floor) this.state.target = null;
    this.state.error = '';
  }

  close() {
    this.state.doorsOpen = false;
    this.state.error = '';
  }

  move(direction) {
    if (this.state.doorsOpen)
      return 'Fermez les portes avant de déplacer la cabine.';
    if (direction !== -1 && direction !== 1) return 'Déplacement invalide.';
    const next = this.state.floor + direction;
    if (next < 0 || next > 7) return 'Limite du bâtiment atteinte.';
    this.state.floor = next;
    this.state.heading = direction;
    this.state.error = '';
    return null;
  }
}

export class MazeSimulation {
  constructor() {
    this.paths = new Set();
    for (let c = 1; c <= 6; c++) this.paths.add(`6:${c}`);
    for (let r = 2; r <= 10; r++) this.paths.add(`${r}:6`);
    for (let c = 6; c <= 10; c++) {
      this.paths.add(`2:${c}`);
      this.paths.add(`10:${c}`);
    }
    this.reset();
  }

  reset() {
    this.state = {
      row: 6,
      col: 1,
      direction: 1,
      hasKey: false,
      completed: false,
      error: '',
    };
  }

  ahead() {
    const [r, c] = [
      [-1, 0],
      [0, 1],
      [1, 0],
      [0, -1],
    ][this.state.direction];
    return [this.state.row + r, this.state.col + c];
  }

  wallAhead() {
    return !this.paths.has(this.ahead().join(':'));
  }

  onKey() {
    return this.state.row === 2 && this.state.col === 10 && !this.state.hasKey;
  }

  collectKey() {
    if (!this.onKey()) return 'Il n’y a pas de clé sur cette case.';
    this.state.hasKey = true;
    this.state.error = '';
    return null;
  }

  turn(delta) {
    this.state.direction = (this.state.direction + delta + 4) % 4;
  }

  move() {
    const [row, col] = this.ahead();
    if (this.wallAhead()) return 'Le robot rencontre un mur.';
    if (row === 10 && col === 10 && !this.state.hasKey)
      return 'La porte est verrouillée : il faut la clé.';
    this.state.row = row;
    this.state.col = col;
    this.state.completed = row === 10 && col === 10 && this.state.hasKey;
    this.state.error = '';
    return null;
  }
}
