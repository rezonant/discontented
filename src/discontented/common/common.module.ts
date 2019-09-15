import { Module, ConfiguredModule, Provider } from "@alterior/di";
import { Context, DCF_OPTIONS } from "./context";

@Module({
    providers: []
})
export class DcfCommonModule {
    static configureProviders(context : Context): Provider[] {
        return [
            { provide: DCF_OPTIONS, useValue: context.definition || {} },
            { provide: Context, useValue: context }
        ];
    }
}