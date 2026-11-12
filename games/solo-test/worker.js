// Background solver: answers "fewest pegs still reachable" without blocking the board.
importScripts('engine.js');
const memos = {}; // per board, dead positions per goal; stays valid across moves of the same board
onmessage = (e) => {
  const { id, board, b } = e.data;
  const memo = (memos[board] = memos[board] || {});
  postMessage({ id, ...self.SoloTest.bestPossible(b, { ms: 2500, memo }) });
};
