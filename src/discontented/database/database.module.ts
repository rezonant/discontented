import { Module } from "@alterior/di";
import { DatabaseService } from "./database.service";

@Module({
    providers: [
        DatabaseService
    ]
})
export class DatabaseModule {
    constructor() {

    }
}