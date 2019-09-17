import { CfStore } from "./common";
import { AssetLocator } from "./asset-locator";

export class OfflineAssetLocator implements AssetLocator {
    constructor(readonly store : CfStore) {
    }

    async retrieveAsset(spaceId : string, assetId : string) {
        return this.store.assets.find(x => x.sys.space.sys.id === spaceId && x.sys.id === assetId);
    }
}
