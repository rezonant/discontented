import { Module, ConfiguredModule } from "@alterior/di";
import { DcfCommonModule, Context } from "./common";
import { DatabaseModule } from "./database";
import { ServiceModule } from "./service";
import { AppOptions } from "@alterior/runtime";
import { WebServiceModule } from "./web-service";
import { DiscontentedCli } from "./cli";

@AppOptions()
@Module({
    imports: [
        DcfCommonModule,
        DatabaseModule,
        ServiceModule,
        WebServiceModule
    ],
    providers: [
        DiscontentedCli
    ]
})
export class DiscontentedModule {
    static configure(context : Context)  {
        return <ConfiguredModule>{
            $module: DiscontentedModule,
            providers: DcfCommonModule.configureProviders(context)
        }
    }
}