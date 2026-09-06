import { createLocalAsset } from './local-assets.mjs';

const svg = (width, height, content) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${content}</svg>`;

export async function buildLabProject(vm, extension) {
  const storage = vm.runtime.storage;
  function costume(name, width, height, content) {
    const asset = createLocalAsset(
      storage,
      storage.AssetType.ImageVector,
      storage.DataFormat.SVG,
      new TextEncoder().encode(svg(width, height, content)),
    );
    return {
      name,
      assetId: asset.assetId,
      md5ext: `${asset.assetId}.svg`,
      dataFormat: 'svg',
      bitmapResolution: 1,
      rotationCenterX: width / 2,
      rotationCenterY: height / 2,
    };
  }

  function target(name, costumes, x = 0, y = 0, blocks = {}) {
    return {
      isStage: false,
      name,
      variables: {},
      lists: {},
      broadcasts: {},
      blocks,
      comments: {},
      currentCostume: 0,
      costumes,
      sounds: [],
      volume: 100,
      layerOrder: 1,
      visible: true,
      x,
      y,
      size: 100,
      direction: 90,
      draggable: false,
      rotationStyle: "don't rotate",
    };
  }

  const flag = {
    start: {
      opcode: 'event_whenflagclicked',
      next: null,
      parent: null,
      inputs: {},
      fields: {},
      shadow: false,
      topLevel: true,
      x: 40,
      y: 40,
    },
  };
  const label = (x, y, text, size = 13, fill = '#c8d8e8') =>
    `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${size}" fill="${fill}">${text}</text>`;
  let stageArt = '<rect width="480" height="360" fill="#0d1726"/>';
  const targets = [];
  const values =
    extension.mode === 'maze'
      ? { 'Clé récupérée': 'non', Message: '' }
      : {
          Étage: 0,
          Portes: 'fermées',
          Appels: '',
          Destinations: '',
          Arrêts: '',
          Message: '',
        };

  if (extension.mode === 'maze') {
    for (let row = 0; row < 13; row++) {
      for (let col = 0; col < 13; col++) {
        const open = extension.simulation.paths.has(`${row}:${col}`);
        stageArt += `<rect x="${84 + col * 24}" y="${24 + row * 24}" width="24" height="24" fill="${open ? '#24364d' : '#101c2e'}" stroke="#35435a" stroke-width="0.5"/>`;
      }
    }
    stageArt += label(278, 285, 'SORTIE', 10, '#bbfd64');
    const robot = target(
      'Robot',
      [
        costume(
          'Robot',
          22,
          22,
          '<path d="M21 11L1 1L5 11L1 21Z" fill="#d9ff66" stroke="#92b035"/>',
        ),
      ],
      -120,
      0,
      flag,
    );
    robot.rotationStyle = 'all around';
    robot.direction = 90;
    targets.push(
      robot,
      target(
        'Clé',
        [
          costume(
            'Clé',
            22,
            22,
            '<g fill="none" stroke="#ffc36c" stroke-width="3"><circle cx="7" cy="7" r="4"/><path d="M10 10L19 19M14 14L17 11M17 17L20 14"/></g>',
          ),
        ],
        96,
        96,
      ),
      target(
        'Sortie',
        [
          costume(
            'Sortie',
            22,
            22,
            '<rect x="3" y="2" width="16" height="19" rx="2" fill="#5ab8cd"/><circle cx="15" cy="12" r="1.5" fill="#0d1726"/>',
          ),
        ],
        96,
        -96,
      ),
    );
  } else {
    stageArt +=
      label(144, 54, 'APPELS EXTÉRIEURS', 11) +
      label(306, 54, 'DANS LA CABINE', 11);
    stageArt +=
      '<rect x="63" y="52" width="53" height="267" rx="3" fill="#17263c" stroke="#73859f"/>';
    for (let floor = 0; floor <= 7; floor++) {
      const y = 302 - floor * 34;
      stageArt +=
        `<path d="M60 ${y + 15}H118" stroke="#607087"/>` +
        label(40, y + 4, String(floor));
      for (const [kind, name, x] of [
        ['call', 'Appel', -8],
        ['destination', 'Étage', 116],
      ]) {
        const button = (active) =>
          costume(
            `${name} ${floor}${active ? ' actif' : ''}`,
            94,
            27,
            `<rect x="1" y="1" width="92" height="25" rx="5" fill="${active ? '#8a5908' : '#283b55'}" stroke="${active ? '#ffc36c' : '#718bad'}"/>` +
              label(
                10,
                18,
                kind === 'call' ? `Appel ${floor}` : `${floor}`,
                13,
                '#ffffff',
              ),
          );
        targets.push(
          target(
            `${name} ${floor}`,
            [button(false), button(true)],
            x,
            180 - y,
            {
              click: {
                opcode: 'event_whenthisspriteclicked',
                next: 'request',
                parent: null,
                inputs: {},
                fields: {},
                topLevel: true,
                shadow: false,
                x: 40,
                y: 40,
              },
              request: {
                opcode: `${extension.id}_${kind}`,
                next: null,
                parent: 'click',
                inputs: { FLOOR: [1, [4, String(floor)]] },
                fields: {},
                topLevel: false,
                shadow: false,
              },
            },
          ),
        );
      }
    }
    const response = await fetch('../elevator-cabin.png');
    if (!response.ok) throw new Error('Cabin image could not be loaded.');
    const data = new Uint8Array(await response.arrayBuffer());
    const asset = createLocalAsset(
      storage,
      storage.AssetType.ImageBitmap,
      storage.DataFormat.PNG,
      data,
    );
    const bitmap = await createImageBitmap(
      new Blob([data], { type: 'image/png' }),
    );
    const cabin = target(
      'Cabine',
      [
        {
          name: 'Cabine',
          assetId: asset.assetId,
          md5ext: `${asset.assetId}.png`,
          dataFormat: 'png',
          bitmapResolution: 1,
          rotationCenterX: bitmap.width / 2,
          rotationCenterY: bitmap.height / 2,
        },
      ],
      -151,
      -122,
      flag,
    );
    cabin.size = Math.min(42 / bitmap.width, 32 / bitmap.height) * 100;
    bitmap.close();
    targets.unshift(cabin);
    const panel = costume(
      'Porte',
      13,
      23,
      '<rect width="13" height="23" fill="#7c919f" stroke="#273a4e"/>',
    );
    targets.push(
      target('Porte gauche', [panel], -158, -122),
      target('Porte droite', [panel], -144, -122),
    );
  }

  const variables = {};
  const monitors = Object.entries(values).map(([name, value], index) => {
    const id = `lab-variable-${index}`;
    variables[id] = [name, value];
    return {
      id,
      mode: 'default',
      opcode: 'data_variable',
      params: { VARIABLE: name },
      spriteName: null,
      value,
      width: 0,
      height: 0,
      x: index === 1 ? 180 : 4,
      y: name === 'Message' ? 337 : index < 2 ? 2 : 27,
      visible: index < 2 || name === 'Message',
      sliderMin: 0,
      sliderMax: 100,
      isDiscrete: true,
    };
  });
  const stage = {
    ...target('Stage', [costume('Labo', 480, 360, stageArt)]),
    isStage: true,
    variables,
    layerOrder: 0,
    tempo: 60,
    videoTransparency: 50,
    videoState: 'off',
    textToSpeechLanguage: null,
  };
  targets.forEach((item, index) => {
    item.layerOrder = index + 1;
  });
  return {
    targets: [stage, ...targets],
    monitors,
    extensions: [extension.id],
    meta: { semver: '3.0.0', vm: '15.1.1', agent: 'STALK Techno' },
  };
}
