const stores = new WeakMap();

export function createLocalAsset(storage, type, format, data) {
  let assets = stores.get(storage);
  if (!assets) {
    assets = new Map();
    stores.set(storage, assets);
    storage.addHelper(
      {
        load(assetType, assetId, dataFormat) {
          const asset = assets.get(`${assetId}.${dataFormat}`);
          return asset?.assetType === assetType ? Promise.resolve(asset) : null;
        },
      },
      110,
    );
  }
  const asset = storage.createAsset(type, format, data, null, true);
  assets.set(`${asset.assetId}.${format}`, asset);
  return asset;
}
