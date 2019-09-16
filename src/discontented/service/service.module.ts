import { Module } from "@alterior/di";
import { PushService } from "./push.service";
import { PullService } from "./pull.service";
import { SchemaService } from "./schema.service";
import { ContentfulManagementService } from "./contentful-management";

@Module({
    providers: [
        ContentfulManagementService,
        SchemaService,
        PullService,
        PushService
    ]
})
export class ServiceModule {
    constructor() {

    }
}