import { CfStore, CfEntry } from "./common";
import { ContentfulLocator } from "./asset-locator";

export class OfflineContentfulLocator implements ContentfulLocator {
    constructor(readonly store : CfStore) {
    }

    async retrievePublishedEntry(spaceId : string, entryId : string): Promise<CfEntry> {
        return this.store.publishedEntries.find(x => x.sys.space.sys.id === spaceId && x.sys.id === entryId);
    }
    
    async retrieveAsset(spaceId : string, assetId : string) {
        return this.store.assets.find(x => x.sys.space.sys.id === spaceId && x.sys.id === assetId);
    }
}
