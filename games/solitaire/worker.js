// Background Klondike solver: winnable deals and hints, off the main thread.
importScripts('engine.js');
const K = self.Klondike;
onmessage = (e) => {
  const { id, type } = e.data;
  if (type === 'deal') {
    const r = K.winnableDeal(e.data.seed, e.data.draw, { nodes: 20000 });
    postMessage({ id, seed: r.seed, tries: r.tries });
  } else if (type === 'hint') {
    const r = K.solve(e.data.state, { nodes: 150000 });
    postMessage({ id, move: r.ok && r.line.length ? r.line[0] : null, gaveUp: r.gaveUp });
  }
};
