import { LabExtension } from './lab-extension.mjs';
import { buildLabProject } from './templates.mjs';
import { createLabBridge } from './bridge.mjs';

const params = new URLSearchParams(location.search);
const mode = ['maze', 'elevator'].includes(params.get('mode'))
  ? params.get('mode')
  : 'free';
const loading = document.getElementById('scratch-loading');
const host = document.getElementById('scratch-editor');
if (mode !== 'free' && params.get('embedded') === '1') {
  document.body.classList.add('lab-embedded');
}
let ready = false;
let saveTimer;
let saving = false;
let dirty = false;
let extension;
let vm;
let db;
const bridge = createLabBridge(
  window,
  mode,
  () => extension,
  () => ready,
);

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('stalk-scratch-projects', 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore('projects');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readSaved() {
  if (!db) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = db
      .transaction('projects')
      .objectStore('projects')
      .get(mode);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function save() {
  if (!ready || !db) return;
  dirty = true;
  if (saving) return;
  saving = true;
  try {
    while (dirty) {
      dirty = false;
      const blob = await vm.saveProjectSb3();
      const record = {
        project: await blob.arrayBuffer(),
        simulation: extension?.simulation.state,
        title: document.title,
        updatedAt: Date.now(),
      };
      await new Promise((resolve, reject) => {
        const transaction = db.transaction('projects', 'readwrite');
        transaction.objectStore('projects').put(record, mode);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    }
  } catch (error) {
    console.error('Scratch local save failed', error);
    loading.textContent =
      'La sauvegarde locale a échoué. Utilisez Fichier → Sauvegarder sur votre ordinateur.';
    loading.hidden = false;
    loading.onclick = () => {
      loading.hidden = true;
    };
  } finally {
    saving = false;
  }
}

function queueSave() {
  if (!ready) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 500);
}

try {
  if (!window.GUI?.createStandaloneRoot)
    throw new Error('Scratch runtime is missing.');
  const GUI = window.GUI;
  const state = new GUI.EditorState({ locale: 'fr', isPlayerOnly: false });
  vm = state.store.getState().scratchGui.vm;
  db = await openDatabase().catch(() => null);
  if (mode !== 'free') {
    extension = new LabExtension(vm, mode, (simulation) => {
      queueSave();
      bridge.publishState();
      if (mode === 'maze' && simulation.completed) bridge.notify('complete');
    });
    const service = vm.extensionManager._registerInternalExtension(extension);
    vm.extensionManager._loadedExtensions.set(extension.id, service);
  }

  GUI.setAppElement(host);
  const gui = GUI.createStandaloneRoot(state, host);
  const initialLoad = new Promise((resolve) =>
    vm.runtime.once('PROJECT_LOADED', resolve),
  );
  gui.render({
    canEditTitle: true,
    canSave: false,
    canCreateNew: false,
    basePath: './vendor/',
    canSaveAsCopy: false,
    canShare: false,
    canRemix: false,
    backpackVisible: false,
    showComingSoon: false,
    showTelemetryModal: false,
    projectId: '0',
    onClickLogo: () => {},
  });

  await initialLoad;
  // Wait for the GUI's own project-load completion before replacing its default project.
  await new Promise((resolve) => setTimeout(resolve, 0));
  const saved = await readSaved();
  const load = async (project) => {
    state.dispatch(
      GUI.requestProjectUpload(
        state.store.getState().scratchGui.projectState.loadingState,
      ),
    );
    await vm.loadProject(project);
    state.dispatch(GUI.onLoadedProject('LOADING_VM_FILE_UPLOAD', false, true));
    vm.emitTargetsUpdate();
    vm.emitWorkspaceUpdate();
  };
  if (saved?.project) {
    try {
      await load(saved.project);
      // The project is restored; a stopped simulation starts from its visible saved state.
      if (extension && saved.simulation) {
        const snapshot = saved.simulation;
        if (
          mode === 'elevator' &&
          Number.isInteger(snapshot.floor) &&
          snapshot.floor >= 0 &&
          snapshot.floor <= 7
        ) {
          extension.simulation.state.floor = snapshot.floor;
          extension.simulation.state.doorsOpen = Boolean(snapshot.doorsOpen);
          extension.simulation.state.heading = snapshot.heading === -1 ? -1 : 1;
          extension.simulation.state.target =
            Number.isInteger(snapshot.target) &&
            snapshot.target >= 0 &&
            snapshot.target <= 7
              ? snapshot.target
              : null;
          extension.simulation.state.served = Array.isArray(snapshot.served)
            ? snapshot.served
                .filter(
                  (floor) =>
                    Number.isInteger(floor) && floor >= 0 && floor <= 7,
                )
                .slice(-100)
            : [];
          for (const value of snapshot.calls ?? [])
            extension.simulation.request('calls', value);
          for (const value of snapshot.destinations ?? [])
            extension.simulation.request('destinations', value);
        } else if (
          mode === 'maze' &&
          extension.simulation.paths.has(`${snapshot.row}:${snapshot.col}`)
        ) {
          Object.assign(extension.simulation.state, {
            row: snapshot.row,
            col: snapshot.col,
            direction: [0, 1, 2, 3].includes(snapshot.direction)
              ? snapshot.direction
              : 1,
            hasKey: Boolean(snapshot.hasKey),
          });
        }
      }
    } catch (error) {
      console.error('Could not restore the Scratch project', error);
      throw new Error(
        'Le projet sauvegardé ne peut pas être chargé. Il est conservé dans ce navigateur.',
      );
    }
  } else if (extension) {
    await load(JSON.stringify(await buildLabProject(vm, extension)));
  }
  if (extension) {
    extension.publish();
    const controller = vm.runtime.targets.find(
      (target) => target.getName() === (mode === 'maze' ? 'Robot' : 'Cabine'),
    );
    if (controller) vm.setEditingTarget(controller.id);
  }
  ready = true;
  vm.on('PROJECT_CHANGED', queueSave);
  vm.on('PROJECT_RUN_STOP', queueSave);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) void save();
  });
  window.addEventListener('pagehide', (event) => {
    void save();
    vm.stopAll();
    if (!event.persisted) bridge.dispose();
  });
  window.stalkScratch = {
    vm,
    gui,
    state,
    extension,
    save,
    mode,
    version: '15.1.1',
  };
  loading.hidden = true;
  bridge.publishState();
  bridge.notify('ready');
  queueSave();
} catch (error) {
  console.error(error);
  loading.textContent = `Impossible de charger Scratch. ${error.message}`;
  bridge.notify('error');
}
