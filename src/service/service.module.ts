import { Module, ConfiguredModule } from "@alterior/di";
import { DiscontentedService } from "./discontented-service";
import { DCF_OPTIONS, Context, DcfCommonModule } from "../common";

@Module({
    imports: [ 
        DcfCommonModule,
        DiscontentedService 
    ]
})
export class ServiceModule {
}