import { Module } from "@alterior/di";
import { ServiceModule } from "./service";
import { DcfCommonModule, Context } from "./common";

@Module({
    imports: [
        DcfCommonModule.configure(new Context({
            schemaFile: 'data/contentful-schema.json',
            tablePrefix: 'discontented_',
            tableMap: {
                sFzTZbSuM8coEwygeUYes: 'franchises',
                episode: 'productions',
                talent: 'talent',
                articlePortion: 'article_blocks',
                audioMedia: 'podcasts',
                clip: 'vods'
            }    
        })),
        
        ServiceModule
    ]
})
export class AppModule {

}