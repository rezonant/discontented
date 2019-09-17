import { AssetLocator } from "./asset-locator";
import { CfAsset } from "./common";
import { ContentfulManagementService } from "./service/contentful-management";

export class OnlineAssetLocator implements AssetLocator {
    constructor(
        private contentfulManagement : ContentfulManagementService
    ) {
    }

    async retrieveAsset(spaceId: string, assetId: string): Promise<CfAsset> {
        return await this.contentfulManagement.getAsset(spaceId, 'master', assetId);
    }
}