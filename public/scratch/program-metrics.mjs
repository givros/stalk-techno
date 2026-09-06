export function countProjectBlocks(vm) {
  let count = 0;
  for (const target of vm.runtime.targets) {
    if (!target.isOriginal) continue;
    const visited = new Set();
    const pending = [...target.blocks.getScripts()];
    while (pending.length > 0) {
      const id = pending.pop();
      if (!id || visited.has(id)) continue;
      visited.add(id);
      const block = target.blocks.getBlock(id);
      if (!block) continue;
      // Count placed blocks, including hats and reporters, but not input fields.
      if (!block.shadow) count += 1;
      pending.push(block.next);
      for (const input of Object.values(block.inputs ?? {})) {
        pending.push(input.block);
      }
    }
  }
  return count;
}
