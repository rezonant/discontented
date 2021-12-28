import { CfStore, CfEntry, CfAsset } from "./common";
import { ContentfulLocator } from "./asset-locator";

export class OfflineContentfulLocator implements ContentfulLocator {
    constructor(readonly store : CfStore) {
        console.log(`[OfflineContentfulLocator] Generating ID mapping for entries...`);
        for (let entry of this.store.publishedEntries)
            this.entryMap.set(`${entry.sys.space.sys.id}/${entry.sys.id}`, entry);
        
        console.log(`[OfflineContentfulLocator] Generating ID mapping for assets...`);
        for (let asset of this.store.assets)
            this.assetMap.set(`${asset.sys.space.sys.id}/${asset.sys.id}`, asset);
            
        console.log(`[OfflineContentfulLocator] Done generating ID maps.`);
    }

    private entryMap = new Map<string, CfEntry>();
    private assetMap = new Map<string, CfAsset>();

    async retrievePublishedEntry(spaceId : string, entryId : string): Promise<CfEntry> {
        return this.entryMap.get(`${spaceId}/${entryId}`);
    }
    
    async retrieveAsset(spaceId : string, assetId : string) {
        return this.assetMap.get(`${spaceId}/${assetId}`);
    }
}
