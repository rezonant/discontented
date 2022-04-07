import { Module } from "@alterior/di";
import { PushService } from "./push.service";
import { PullService } from "./pull.service";
import { SchemaService } from "./schema.service";
import { ContentfulManagementService } from "./contentful-management";
import { ContentfulDeliveryService } from "./contentful-delivery";
import { AssetUploader } from "./asset-uploader";

@Module({
    providers: [
        ContentfulManagementService,
        ContentfulDeliveryService,
        SchemaService,
        PullService,
        PushService,
        AssetUploader
    ]
})
export class ServiceModule {
    constructor() {

    }
}