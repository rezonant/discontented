import { Module } from "@alterior/di";
import { PushService } from "./push.service";
import { PullService } from "./pull.service";
import { SchemaService } from "./schema.service";

@Module({
    providers: [
        SchemaService,
        PullService,
        PushService
    ]
})
export class ServiceModule {
    constructor() {

    }
}