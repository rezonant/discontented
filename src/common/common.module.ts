import { Module, ConfiguredModule } from "@alterior/di";
import { Context, DCF_OPTIONS } from "./context";

@Module({
    providers: [
        Context
    ]
})
export class DcfCommonModule {
    static configure(context : Context)  {
        return <ConfiguredModule>{
            $module: DcfCommonModule,
            providers: [
                { provide: DCF_OPTIONS, useValue: context.definition || {} },
                { provide: Context, useValue: context }
            ]
        }
    }
}