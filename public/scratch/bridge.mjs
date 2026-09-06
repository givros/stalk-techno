// The iframe owns the VM; the surrounding site only displays its state and
// forwards physical button presses. It never runs a second simulation.
export function createLabBridge(
  host,
  mode,
  getExtension,
  isReady,
  getChallengeState = () => ({}),
) {
  function notify(type, detail = {}) {
    if (host.parent === host) return;
    host.parent.postMessage(
      { source: 'stalk-scratch', type, mode, ...detail },
      host.location.origin,
    );
  }

  function publishState() {
    const extension = getExtension();
    if (!extension) return;
    notify('state', {
      ready: isReady(),
      state: {
        ...extension.simulation.state,
        motion: extension.motion ?? 'idle',
        ...getChallengeState(),
      },
    });
  }

  function onMessage(event) {
    if (event.origin !== host.location.origin || event.source !== host.parent)
      return;
    const message = event.data;
    if (message?.source !== 'stalk-site' || message.mode !== mode) return;
    if (message.type === 'sync') {
      publishState();
      return;
    }
    if (!isReady() || mode !== 'elevator') return;
    const extension = getExtension();
    if (
      !extension ||
      !Number.isInteger(message.floor) ||
      message.floor < 0 ||
      message.floor > 7
    )
      return;
    if (message.type === 'call') extension.call({ FLOOR: message.floor });
    if (message.type === 'destination')
      extension.destination({ FLOOR: message.floor });
  }

  host.addEventListener('message', onMessage);
  return {
    notify,
    publishState,
    dispose: () => host.removeEventListener('message', onMessage),
  };
}
