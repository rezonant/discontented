import { Module } from "@alterior/di";
import { PushService } from "./push.service";

@Module({
    providers: [
        PushService
    ]
})
export class ServiceModule {
    constructor() {

    }
}