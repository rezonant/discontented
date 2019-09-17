import { CfAsset } from "./common";

export interface AssetLocator {
    retrieveAsset(spaceId : string, assetId : string) : Promise<CfAsset>;
}