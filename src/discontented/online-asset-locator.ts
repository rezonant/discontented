import { ContentfulLocator } from "./asset-locator";
import { CfAsset, CfEntry } from "./common";
import { ContentfulManagementService } from "./service/contentful-management";
import { ContentfulDeliveryService } from "./service/contentful-delivery";

export class OnlineContentfulLocator implements ContentfulLocator {
    constructor(
        private contentfulManagement : ContentfulManagementService,
        private contentfulDelivery : ContentfulDeliveryService
    ) {
    }

    async retrievePublishedEntry(spaceId: string, entryId: string): Promise<CfEntry> {
        return await this.contentfulDelivery.getEntry(spaceId, 'master', entryId);
    }

    async retrieveAsset(spaceId: string, assetId: string): Promise<CfAsset> {
        return await this.contentfulManagement.getAsset(assetId);
    }
}