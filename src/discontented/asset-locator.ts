import { CfAsset, CfEntry } from "./common";

export interface ContentfulLocator {
    retrieveAsset(spaceId : string, assetId : string) : Promise<CfAsset>;
    retrievePublishedEntry(spaceId : string, entryId : string): Promise<CfEntry>;
}