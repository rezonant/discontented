import { Module, ConfiguredModule } from "@alterior/di";
import { DiscontentedService } from "./web-service";
import { DCF_OPTIONS, Context, DcfCommonModule } from "../common";
import { WebServerModule } from "@alterior/web-server";

@Module({
    imports: [ 
        WebServerModule.configure({
            port: 3001
        }),
        DcfCommonModule
    ],
    controllers: [ DiscontentedService ]
})
export class WebServiceModule {
}